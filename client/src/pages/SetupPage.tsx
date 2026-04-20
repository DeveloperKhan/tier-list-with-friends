import { useEffect, useRef, useState } from 'react';
import { useGame, type Tier } from '@/context/GameContext';
import { useDiscord } from '@/context/DiscordContext';
import { GameButton } from '@/components/ui/GameButton';
import { Panel, SectionLabel } from '@/components/ui/Panel';
import { PlayerList } from '@/components/ui/PlayerList';
import { TierMakerBrowser, type TierMakerTemplateItem } from '@/components/TierMakerBrowser';
import { cn, getItemSrc } from '@/lib/utils';
import { uploadImage, ACCEPTED_ACCEPT, ACCEPTED_LABEL } from '@/lib/imageUpload';
import { MAX_ITEMS, MAX_ITEMS_PREMIUM, MAX_TEXT_ITEM_LENGTH, MAX_TIER_LABEL_LENGTH, MAX_TIERS, MAX_TITLE_LENGTH, Z } from '@/lib/constants';
import { ImageIcon, FolderOpen, Gamepad2 } from 'lucide-react';
import logoUrl from '/assets/square-logo.svg';
import { SetupBackground } from '@/components/ui/SetupBackground';

// ---------------------------------------------------------------------------
// Local-only types (never sent to server until Start Game)
// ---------------------------------------------------------------------------

type LocalItem = {
  id: string;
  kind: 'upload' | 'tiermaker' | 'text';
  imageUrl: string;  // TierMaker path — only for kind='tiermaker'
  text: string;      // tile label — only for kind='text'
  fileName: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TIER_PALETTE = [
  '#FF4444', '#FF8C00', '#FFD700', '#32CD32',
  '#1E90FF', '#9932CC', '#FF69B4', '#00CED1',
];


function createDefaultTiers(): Tier[] {
  const defaults = [
    { label: 'S', color: '#FF4444' },
    { label: 'A', color: '#FF8C00' },
    { label: 'B', color: '#FFD700' },
    { label: 'C', color: '#32CD32' },
    { label: 'D', color: '#1E90FF' },
    { label: 'F', color: '#9932CC' },
  ];
  return defaults.map((t) => ({ ...t, id: crypto.randomUUID(), itemIds: [] }));
}

// ---------------------------------------------------------------------------
// Tier row
// ---------------------------------------------------------------------------

interface TierRowProps {
  tier: Tier;
  index: number;
  total: number;
  onChange: (id: string, patch: Partial<Tier>) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, dir: 'up' | 'down') => void;
}

function TierRow({ tier, index, total, onChange, onDelete, onMove }: TierRowProps) {
  const colorRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
      <div className="relative h-8 w-8 flex-shrink-0">
        <div
          className="h-8 w-8 rounded-lg border-2 border-white/20 shadow-inner transition-transform hover:scale-110 cursor-pointer"
          style={{ backgroundColor: tier.color }}
          title="Change colour"
        />
        <input
          ref={colorRef}
          type="color"
          value={tier.color}
          onChange={(e) => onChange(tier.id, { color: e.target.value })}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          tabIndex={-1}
        />
      </div>

      <input
        type="text"
        value={tier.label}
        onChange={(e) => onChange(tier.id, { label: e.target.value })}
        maxLength={MAX_TIER_LABEL_LENGTH}
        size={Math.max(2, tier.label.length)}
        className="min-w-0 bg-transparent text-center font-black text-lg focus:outline-none focus:bg-white/5 rounded-lg px-1"
        style={{ color: tier.color }}
      />

      <div className="flex-1" />

      <button
        onClick={() => onMove(tier.id, 'up')}
        disabled={index === 0}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-white/40 hover:bg-white/10 hover:text-white disabled:opacity-20 transition-colors"
      >↑</button>
      <button
        onClick={() => onMove(tier.id, 'down')}
        disabled={index === total - 1}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-white/40 hover:bg-white/10 hover:text-white disabled:opacity-20 transition-colors"
      >↓</button>
      <button
        onClick={() => onDelete(tier.id)}
        className="flex h-7 w-7 items-center justify-center rounded-lg text-white/30 hover:bg-game-red/20 hover:text-game-red transition-colors"
      >✕</button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Image grid
// ---------------------------------------------------------------------------

function ImageGrid({
  bankItemIds,
  items,
  onRemove,
  onClearAll,
}: {
  bankItemIds: string[];
  items: Record<string, LocalItem>;
  onRemove: (id: string) => void;
  onClearAll: () => void;
}) {
  if (bankItemIds.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-white/40">{bankItemIds.length} item{bankItemIds.length !== 1 ? 's' : ''}</span>
        <button
          onClick={onClearAll}
          className="text-xs font-bold text-game-red/70 hover:text-game-red transition-colors px-2 py-0.5 rounded-lg hover:bg-game-red/10"
        >
          Clear all
        </button>
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(72px,1fr))] gap-2">
        {bankItemIds.map((id) => {
          const item = items[id];
          if (!item) return null;
          return (
            <div key={id} className="group relative aspect-square rounded-xl overflow-hidden bg-white/10">
              <img src={getItemSrc(item)} alt={item.fileName} className="h-full w-full object-cover" />
              <button
                onClick={() => onRemove(id)}
                className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity text-white text-lg"
              >✕</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TierMaker modal
// ---------------------------------------------------------------------------

function TierMakerModal({
  onLoad,
  onClose,
}: {
  onLoad: (items: TierMakerTemplateItem[]) => void;
  onClose: () => void;
}) {
  return (
    <div style={{ zIndex: Z.modal }} className="fixed inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div
        className="relative w-full max-w-2xl rounded-2xl border-2 border-game-border bg-game-bg shadow-2xl overflow-hidden"
        style={{ height: 'min(600px, 90vh)' }}
      >
        <TierMakerBrowser
          onLoadTemplate={(items) => { onLoad(items); onClose(); }}
          onClose={onClose}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SetupPage — all config lives in local state until Start Game
// ---------------------------------------------------------------------------

const PREMIUM_SKU_ID = '1495582581889171467';

export function SetupPage() {
  const { roomState, socket, currentUserId, isHost } = useGame();
  const discord = useDiscord();
  const effectiveLimit = roomState?.isPremium ? MAX_ITEMS_PREMIUM : MAX_ITEMS;

  async function handleSupportUs() {
    if (discord.status !== 'ready') return;
    try {
      await discord.discordSdk.commands.startPurchase({ sku_id: PREMIUM_SKU_ID });
    } catch {
      // User cancelled or purchase failed — no action needed
    }
  }

  // Form state — host only, never synced to server until submission
  const [title, setTitle] = useState('');
  const [tiers, setTiers] = useState<Tier[]>(createDefaultTiers);
  const [items, setItems] = useState<Record<string, LocalItem>>({});
  const [bankItemIds, setBankItemIds] = useState<string[]>([]);

  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showTierMaker, setShowTierMaker] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

  // When the socket reconnects while we're waiting for START_GAME to be
  // confirmed, automatically re-emit it so the user doesn't have to click again.
  const isStartingRef = useRef(false);
  isStartingRef.current = isStarting;

  useEffect(() => {
    if (!socket) return;
    const s = socket;
    function onReconnect() {
      if (!isStartingRef.current) return;
      // Re-emit START_GAME on the fresh socket so the server can process it.
      s.emit('START_GAME', {
        instanceId: roomState?.instanceId,
        userId: currentUserId,
        title,
        tiers,
        items,
        bankItemIds,
      });
    }
    s.on('connect', onReconnect);
    return () => { s.off('connect', onReconnect); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!roomState || !socket) return null;

  const itemCount = bankItemIds.length;

  // ── Tier mutations ────────────────────────────────────────────────────────

  function patchTier(id: string, patch: Partial<Tier>) {
    setTiers((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  function deleteTier(id: string) {
    setTiers((prev) => prev.filter((t) => t.id !== id));
  }

  function moveTier(id: string, dir: 'up' | 'down') {
    setTiers((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      if (idx === -1) return prev;
      const next = [...prev];
      const swap = dir === 'up' ? idx - 1 : idx + 1;
      if (swap < 0 || swap >= next.length) return prev;
      [next[idx], next[swap]] = [next[swap], next[idx]];
      return next;
    });
  }

  function addTier() {
    setTiers((prev) => {
      if (prev.length >= MAX_TIERS) {
        setSetupError(`Tier limit reached (max ${MAX_TIERS}).`);
        return prev;
      }
      return [...prev, { id: crypto.randomUUID(), label: 'New', color: TIER_PALETTE[prev.length % TIER_PALETTE.length], itemIds: [] }];
    });
  }

  // ── Image mutations ───────────────────────────────────────────────────────

  async function uploadFiles(files: FileList | File[]) {
    setUploading(true);
    setSetupError(null);
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const imageId = await uploadImage(file);
        setItems((prev) => {
          if (Object.keys(prev).length >= effectiveLimit) {
            setSetupError(`Item limit reached (max ${effectiveLimit}).`);
            return prev;
          }
          return { ...prev, [imageId]: { id: imageId, kind: 'upload' as const, imageUrl: '', text: '', fileName: file.name } };
        });
        setBankItemIds((prev) => (prev.length < effectiveLimit ? [...prev, imageId] : prev));
      } catch (err) {
        setSetupError(err instanceof Error ? err.message : `"${file.name}" failed to upload.`);
      }
    }
    setUploading(false);
  }

  function removeItem(id: string) {
    setItems((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setBankItemIds((prev) => prev.filter((x) => x !== id));
  }

  function clearAllItems() {
    setItems({});
    setBankItemIds([]);
  }

  function addTextItems() {
    const labels = textInput
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (labels.length === 0) return;

    const currentCount = Object.keys(items).length;
    if (currentCount >= effectiveLimit) return;

    const newEntries: LocalItem[] = [];
    for (const label of labels) {
      if (currentCount + newEntries.length >= effectiveLimit) break;
      const id = crypto.randomUUID();
      newEntries.push({ id, kind: 'text', imageUrl: '', text: label, fileName: label });
    }

    setItems((prev) => {
      const next = { ...prev };
      for (const entry of newEntries) next[entry.id] = entry;
      return next;
    });
    setBankItemIds((prev) => [...prev, ...newEntries.map((e) => e.id)]);
    setTextInput('');
  }

  function loadTemplate(loaded: Array<{ kind: 'tiermaker'; imageUrl: string; fileName: string }>) {
    const currentCount = Object.keys(items).length;
    if (currentCount >= effectiveLimit) return;

    const newEntries: LocalItem[] = [];
    for (const item of loaded) {
      if (currentCount + newEntries.length >= effectiveLimit) break;
      const id = crypto.randomUUID();
      newEntries.push({ id, kind: 'tiermaker', imageUrl: item.imageUrl, text: '', fileName: item.fileName });
    }

    setItems((prev) => {
      const next = { ...prev };
      for (const entry of newEntries) next[entry.id] = entry;
      return next;
    });
    setBankItemIds((prev) => [...prev, ...newEntries.map((e) => e.id)]);
  }

  // ── Submit ────────────────────────────────────────────────────────────────

  function handleStartGame() {
    setSetupError(null);
    const emptyTier = tiers.find((t) => !t.label.trim());
    if (emptyTier) { setSetupError('All tiers must have a name.'); return; }
    if (tiers.length > MAX_TIERS) { setSetupError(`Too many tiers (max ${MAX_TIERS}).`); return; }
    if (bankItemIds.length === 0) { setSetupError('Add at least one item before starting.'); return; }
    setIsStarting(true);
    socket?.emit('START_GAME', {
      instanceId: roomState?.instanceId,
      userId: currentUserId,
      title,
      tiers,
      items,
      bankItemIds,
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="relative flex h-full flex-col bg-game-bg overflow-hidden">
        <SetupBackground />
        <div
          className="w-full bg-gradient-to-r from-game-pink via-game-purple to-game-cyan flex-none"
          style={{ height: 'calc(4px + env(safe-area-inset-top))' }}
        />

        <header className="flex-none flex items-center justify-between px-5 py-3 border-b border-white/10 bg-game-bg/80 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <img src={logoUrl} alt="Logo" className="h-8 w-8 rounded-lg" />
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-game-purple-light">Setup</p>
              <h1 className="text-lg font-black text-white leading-tight">Tier Lists with Friends</h1>
            </div>
          </div>
          <PlayerList
            participants={roomState.participants}
            hostId={roomState.hostId}
            currentUserId={currentUserId}
          />
        </header>

        <main className="flex-1 overflow-y-auto game-scroll px-4 py-5">
          <div className="mx-auto max-w-xl space-y-5">

            {/* ── Title ───────────────────────────────────────────────── */}
            {isHost ? (
              <Panel className="p-4">
                <SectionLabel className="mb-2">What are we ranking?</SectionLabel>
                <input
                  type="text"
                  placeholder="e.g. Best Pokémon of Gen 1…"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={MAX_TITLE_LENGTH}
                  className="game-input w-full text-xl font-black"
                />
              </Panel>
            ) : (
              <Panel className="p-4 text-center">
                <p className="text-sm font-bold text-white/50">
                  Waiting for the host to configure the game…
                </p>
              </Panel>
            )}

            {/* ── Tiers (host only) ────────────────────────────────────── */}
            {isHost && (
              <Panel className="p-4">
                <SectionLabel className="mb-3">Tiers</SectionLabel>
                <div className="space-y-2">
                  {tiers.map((tier, i) => (
                    <TierRow
                      key={tier.id}
                      tier={tier}
                      index={i}
                      total={tiers.length}
                      onChange={patchTier}
                      onDelete={deleteTier}
                      onMove={moveTier}
                    />
                  ))}
                </div>
                <GameButton variant="ghost" size="sm" className="mt-3 w-full" onClick={addTier}>
                  + Add Tier
                </GameButton>
              </Panel>
            )}

            {/* ── Images (host only) ───────────────────────────────────── */}
            {isHost && (
              <Panel className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <SectionLabel>Images</SectionLabel>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-white/40">{itemCount} / {effectiveLimit}</span>
                    {!roomState?.isPremium && (
                      <div className="relative group/tip">
                        <button
                          onClick={handleSupportUs}
                          className="text-xs font-bold text-game-purple-light hover:text-white transition-colors px-2 py-0.5 rounded-lg hover:bg-white/10"
                        >
                          ⭐ Support for more slots
                        </button>
                        <div className="pointer-events-none absolute bottom-full right-0 mb-2 w-64 opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150" style={{ zIndex: Z.modal }}>
                          <div className="rounded-xl border border-white/15 bg-game-bg/95 backdrop-blur-sm px-3 py-2.5 text-xs text-white/80 shadow-xl">
                            Help support the server costs for this activity. Upgrades image slots per session from 300 to 2000! More upgrades coming soon...
                          </div>
                          <div className="absolute right-3 top-full h-2 w-2 -translate-y-1/2 rotate-45 border-b border-r border-white/15 bg-game-bg/95" />
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div
                  onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={(e) => { e.preventDefault(); setIsDragging(false); uploadFiles(e.dataTransfer.files); }}
                  className={cn(
                    'rounded-xl border-2 border-dashed transition-colors px-4 py-6 text-center',
                    isDragging
                      ? 'border-game-purple bg-game-purple/10'
                      : 'border-white/15 bg-white/3 hover:border-white/25',
                  )}
                >
                  <ImageIcon className="text-indigo-400 mx-auto mb-1" size={28} />
                  <p className="text-sm font-bold text-white/60">Drop images here</p>
                  <p className="text-xs text-white/30 mt-0.5">or use the buttons below</p>
                  <p className="text-xs text-white/20 mt-1">{ACCEPTED_LABEL}</p>
                </div>

                <div className="flex gap-2 mt-3">
                  <GameButton
                    variant="ghost"
                    size="sm"
                    className="flex-1"
                    disabled={uploading || itemCount >= effectiveLimit}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploading
                      ? 'Uploading…'
                      : <><FolderOpen className="text-amber-400 inline mr-1.5" size={14} />Upload Files</>}
                  </GameButton>
                  <GameButton
                    variant="primary"
                    size="sm"
                    className="flex-1"
                    disabled={itemCount >= effectiveLimit}
                    onClick={() => setShowTierMaker(true)}
                  >
                    <Gamepad2 className="text-purple-400 inline mr-1.5" size={14} />TierMaker
                  </GameButton>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept={ACCEPTED_ACCEPT}
                  multiple
                  onChange={(e) => { if (e.target.files) uploadFiles(e.target.files); e.target.value = ''; }}
                  className="sr-only"
                />

                <div className="mt-3">
                  <p className="text-xs font-bold text-white/40 mb-1.5">Or add text items (comma-separated)</p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={textInput}
                      onChange={(e) => setTextInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') addTextItems(); }}
                      maxLength={MAX_TEXT_ITEM_LENGTH}
                      placeholder="e.g. Dog, Cat, Fish"
                      className="game-input flex-1 text-sm"
                    />
                    <GameButton
                      variant="ghost"
                      size="sm"
                      disabled={textInput.trim().length === 0 || itemCount >= effectiveLimit}
                      onClick={addTextItems}
                    >
                      Add
                    </GameButton>
                  </div>
                </div>

                <ImageGrid bankItemIds={bankItemIds} items={items} onRemove={removeItem} onClearAll={clearAllItems} />
              </Panel>
            )}

            {/* ── Start Game / waiting ─────────────────────────────────── */}
            {isHost ? (
              <>
              {setupError && (
                <p className="rounded-xl border border-red-500/40 bg-red-900/30 px-4 py-2.5 text-sm font-semibold text-red-300">
                  {setupError}
                </p>
              )}
              <GameButton
                variant="success"
                size="lg"
                className="w-full"
                disabled={isStarting}
                onClick={handleStartGame}
              >
                {isStarting ? (
                  <span className="flex items-center justify-center gap-2">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    Starting…
                  </span>
                ) : 'Start Game!'}
              </GameButton>
              </>) : (
              <Panel className="p-4 text-center">
                <p className="text-sm font-bold text-white/50">
                  Waiting for the host to start the game…
                </p>
              </Panel>
            )}

            <div style={{ height: 'calc(1rem + env(safe-area-inset-bottom))' }} />
          </div>
        </main>
      </div>

      {showTierMaker && (
        <TierMakerModal onLoad={loadTemplate} onClose={() => setShowTierMaker(false)} />
      )}
    </>
  );
}
