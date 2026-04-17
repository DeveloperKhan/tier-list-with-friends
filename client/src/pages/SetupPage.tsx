import { useRef, useState } from 'react';
import { useGame, type Tier } from '@/context/GameContext';
import { GameButton } from '@/components/ui/GameButton';
import { Panel, SectionLabel } from '@/components/ui/Panel';
import { PlayerList } from '@/components/ui/PlayerList';
import { TierMakerBrowser } from '@/components/TierMakerBrowser';
import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Local-only types (never sent to server until Start Game)
// ---------------------------------------------------------------------------

type LocalItem = {
  id: string;
  dataUrl: string;
  fileName: string;
  label?: string; // set for text items
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TIER_PALETTE = [
  '#FF4444', '#FF8C00', '#FFD700', '#32CD32',
  '#1E90FF', '#9932CC', '#FF69B4', '#00CED1',
];

function textToDataUrl(text: string): string {
  const size = 120;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  // Background
  ctx.fillStyle = '#1e1e2e';
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, 12);
  ctx.fill();

  // Border
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(0, 0, size, size, 12);
  ctx.stroke();

  // Fit text into the tile
  const maxWidth = 100;
  let fontSize = 22;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${fontSize}px sans-serif`;
  while (ctx.measureText(text).width > maxWidth && fontSize > 9) {
    fontSize -= 1;
    ctx.font = `bold ${fontSize}px sans-serif`;
  }
  ctx.fillText(text, size / 2, size / 2, maxWidth);

  return canvas.toDataURL('image/png');
}

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
        maxLength={50}
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
          if (item.label) {
            return (
              <div key={id} className="group relative aspect-square rounded-xl overflow-hidden bg-white/10 flex items-center justify-center p-1">
                <span className="text-white font-bold text-center break-words leading-tight text-xs pointer-events-none select-none">
                  {item.label}
                </span>
                <button
                  onClick={() => onRemove(id)}
                  className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity text-white text-lg"
                >✕</button>
              </div>
            );
          }
          return (
            <div key={id} className="group relative aspect-square rounded-xl overflow-hidden bg-white/10">
              <img src={item.dataUrl} alt="" className="h-full w-full object-cover" />
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
  onLoad: (items: Array<{ dataUrl: string; fileName: string }>) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
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

export function SetupPage() {
  const { roomState, socket, currentUserId, isHost } = useGame();

  // Form state — host only, never synced to server until submission
  const [title, setTitle] = useState('');
  const [tiers, setTiers] = useState<Tier[]>(createDefaultTiers);
  const [items, setItems] = useState<Record<string, LocalItem>>({});
  const [bankItemIds, setBankItemIds] = useState<string[]>([]);

  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showTierMaker, setShowTierMaker] = useState(false);
  const [textInput, setTextInput] = useState('');

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
    setTiers((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        label: 'New',
        color: TIER_PALETTE[prev.length % TIER_PALETTE.length],
        itemIds: [],
      },
    ]);
  }

  // ── Image mutations ───────────────────────────────────────────────────────

  async function uploadFiles(files: FileList | File[]) {
    setUploading(true);
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      await new Promise<void>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const dataUrl = e.target?.result as string;
          if (dataUrl.length > 200_000) {
            alert(`"${file.name}" is too large (max ~150 KB).`);
          } else {
            const id = crypto.randomUUID();
            setItems((prev) => {
              if (Object.keys(prev).length >= 100) return prev;
              return { ...prev, [id]: { id, dataUrl, fileName: file.name } };
            });
            setBankItemIds((prev) => (prev.length < 100 ? [...prev, id] : prev));
          }
          resolve();
        };
        reader.readAsDataURL(file);
      });
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
    if (currentCount >= 100) return;

    const newEntries: LocalItem[] = [];
    for (const label of labels) {
      if (currentCount + newEntries.length >= 100) break;
      const id = crypto.randomUUID();
      newEntries.push({ id, dataUrl: textToDataUrl(label), fileName: label, label });
    }

    setItems((prev) => {
      const next = { ...prev };
      for (const entry of newEntries) next[entry.id] = entry;
      return next;
    });
    setBankItemIds((prev) => [...prev, ...newEntries.map((e) => e.id)]);
    setTextInput('');
  }

  function loadTemplate(loaded: Array<{ dataUrl: string; fileName: string }>) {
    const currentCount = Object.keys(items).length;
    if (currentCount >= 100) return;

    const newEntries: LocalItem[] = [];
    for (const item of loaded) {
      if (currentCount + newEntries.length >= 100) break;
      if (item.dataUrl.length > 200_000) continue;
      const id = crypto.randomUUID();
      newEntries.push({ id, dataUrl: item.dataUrl, fileName: item.fileName });
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
    socket?.emit('START_GAME', { title, tiers, items, bankItemIds });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <div className="flex h-full flex-col bg-game-bg overflow-hidden">
        <div className="h-1 w-full bg-gradient-to-r from-game-pink via-game-purple to-game-cyan flex-none" />

        <header className="flex-none flex items-center justify-between px-5 py-3 border-b border-white/10 bg-game-bg/80 backdrop-blur-sm">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🏆</span>
            <div>
              <p className="text-xs font-black uppercase tracking-widest text-game-purple-light">Setup</p>
              <h1 className="text-lg font-black text-white leading-tight">Tier List with Friends</h1>
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
                  maxLength={100}
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
                  <span className="text-xs font-bold text-white/40">{itemCount} / 100</span>
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
                  <p className="text-2xl mb-1">🖼️</p>
                  <p className="text-sm font-bold text-white/60">Drop images here</p>
                  <p className="text-xs text-white/30 mt-0.5">or use the buttons below</p>
                </div>

                <div className="flex gap-2 mt-3">
                  <GameButton
                    variant="ghost"
                    size="sm"
                    className="flex-1"
                    disabled={uploading || itemCount >= 100}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploading ? '⏳ Uploading…' : '📁 Upload Files'}
                  </GameButton>
                  <GameButton
                    variant="primary"
                    size="sm"
                    className="flex-1"
                    disabled={itemCount >= 100}
                    onClick={() => setShowTierMaker(true)}
                  >
                    🎮 TierMaker
                  </GameButton>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
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
                      placeholder="e.g. Dog, Cat, Fish"
                      className="game-input flex-1 text-sm"
                    />
                    <GameButton
                      variant="ghost"
                      size="sm"
                      disabled={textInput.trim().length === 0 || itemCount >= 100}
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
              <GameButton
                variant="success"
                size="lg"
                className="w-full"
                disabled={itemCount === 0}
                onClick={handleStartGame}
              >
                🚀 Start Game!
              </GameButton>
            ) : (
              <Panel className="p-4 text-center">
                <p className="text-sm font-bold text-white/50">
                  Waiting for the host to start the game…
                </p>
              </Panel>
            )}

            <div className="h-4" />
          </div>
        </main>
      </div>

      {showTierMaker && (
        <TierMakerModal onLoad={loadTemplate} onClose={() => setShowTierMaker(false)} />
      )}
    </>
  );
}
