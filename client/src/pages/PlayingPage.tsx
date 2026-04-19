import { useEffect, useMemo, useRef, useState } from 'react';
import squareLogoUrl from '../../assets/square-logo.svg?url';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';

// Prefer pointer-under-cursor; fall back to rect overlap for edge drops
function collisionDetection(...args: Parameters<typeof rectIntersection>) {
  const hits = pointerWithin(...args);
  return hits.length > 0 ? hits : rectIntersection(...args);
}
import { useGame, type ImageItem, type Participant, type Tier } from '@/context/GameContext';
import { PlayerCursors } from '@/components/PlayerCursors';
import { DuelCutscene } from '@/components/DuelCutscene';
import { GameButton } from '@/components/ui/GameButton';
import { Panel } from '@/components/ui/Panel';
import { PlayerList } from '@/components/ui/PlayerList';
import { cn, getItemSrc, discordAvatarUrl } from '@/lib/utils';
import { uploadImage, ACCEPTED_ACCEPT, ACCEPTED_LABEL } from '@/lib/imageUpload';
import { MAX_TEXT_ITEM_LENGTH, MAX_TIER_LABEL_LENGTH, MAX_TIERS, Z } from '@/lib/constants';
import { ChevronDown, ChevronUp, Download, Eraser, Eye, EyeOff, Hand, Layers, LogOut, PartyPopper, Pencil, Plus, Trash2, Type, Upload } from 'lucide-react';

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div style={{ zIndex: Z.modal }} className="fixed bottom-36 left-1/2 -translate-x-1/2 animate-bounce-in rounded-xl border-2 border-red-500/50 bg-red-900/80 px-4 py-2 text-sm font-bold text-white shadow-2xl backdrop-blur-sm">
      {message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DraggableItem
// ---------------------------------------------------------------------------

function DraggableItem({
  item,
  currentUserId,
  participants,
  isDragOverlay = false,
  canDuel = false,
  onDuel,
}: {
  item: ImageItem;
  currentUserId: string;
  participants: Record<string, Participant>;
  isDragOverlay?: boolean;
  canDuel?: boolean;
  onDuel?: (itemId: string) => void;
}) {
  const isLockedByOther = item.lockedBy !== null && item.lockedBy !== currentUserId;
  const isOwnedByOther = item.ownedBy !== null && item.ownedBy !== currentUserId;
  const canInteract = !isLockedByOther && !isOwnedByOther;

  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    disabled: !canInteract || isDragOverlay,
  });

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  const blockerId = isLockedByOther ? item.lockedBy! : isOwnedByOther ? item.ownedBy! : null;
  const blocker = blockerId ? participants[blockerId] : null;
  const blockerLabel = isLockedByOther ? 'Moving…' : 'Placed by';

  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltipBelow, setTooltipBelow] = useState(false);

  function checkTooltipDirection() {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    setTooltipBelow(rect.top < 90);
  }

  return (
    <div
      ref={(node) => { setNodeRef(node); (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = node; }}
      style={style}
      onMouseEnter={checkTooltipDirection}
      {...(canInteract && !isDragOverlay ? { ...attributes, ...listeners } : {})}
      className={cn(
        'group relative aspect-square w-14 flex-shrink-0 rounded-lg bg-white/10',
        canInteract && !isDragOverlay && 'cursor-grab active:cursor-grabbing touch-none',
        isLockedByOther && 'opacity-50 cursor-not-allowed',
        isOwnedByOther && 'opacity-75 ring-1 ring-white/20 cursor-not-allowed',
        isDragging && !isDragOverlay && 'opacity-0',
        isDragOverlay && 'scale-105 cursor-grabbing shadow-2xl ring-2 ring-purple-400',
      )}
    >
      {/* Image clipped independently so the tooltip can escape */}
      <div className="absolute inset-0 rounded-lg overflow-hidden">
        <img
          src={getItemSrc(item)}
          alt={item.fileName}
          draggable={false}
          className="h-full w-full object-cover"
        />
      </div>
      {blocker && (
        <div className={cn(
          'absolute left-1/2 -translate-x-1/2 w-max opacity-0 group-hover:opacity-100 transition-opacity duration-150 z-50',
          tooltipBelow ? 'top-full mt-1.5 flex-col-reverse' : 'bottom-full mb-1.5',
          canDuel ? 'pointer-events-auto hover:opacity-100' : 'pointer-events-none',
        )}>
          <div className="flex items-center gap-1.5 rounded-lg bg-black/90 px-2 py-1.5 shadow-xl border border-white/10 whitespace-nowrap">
            <img
              src={discordAvatarUrl(blockerId!, blocker.avatar)}
              alt={blocker.username}
              className="h-4 w-4 rounded-full object-cover flex-none"
            />
            <div className="flex flex-col leading-none gap-0.5">
              <span className="text-white/50 text-[9px]">{blockerLabel}</span>
              <span className="text-white text-[10px] font-semibold">{blocker.username}</span>
            </div>
            {canDuel && (
              <button
                onClick={(e) => { e.stopPropagation(); onDuel?.(item.id); }}
                className="ml-1 rounded-md bg-purple-600 hover:bg-purple-500 px-1.5 py-0.5 text-[10px] font-black text-white transition-colors"
              >
                ⚔️ Duel
              </button>
            )}
          </div>
          {/* Caret */}
          <div className={cn('mx-auto w-2 h-1 overflow-hidden flex justify-center', tooltipBelow ? 'order-first' : '')}>
            <div className={cn('w-2 h-2 bg-black/90 border-white/10', tooltipBelow ? 'border-l border-t rotate-45 translate-y-1' : 'border-r border-b rotate-45 -translate-y-1')} />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TierDropZone
// ---------------------------------------------------------------------------

function TierItemSlot({ itemId, children }: { itemId: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `slot:${itemId}` });
  return (
    <div ref={setNodeRef} className={cn('rounded-lg', isOver && 'ring-2 ring-blue-400')}>
      {children}
    </div>
  );
}

function BankItemSlot({ itemId, children }: { itemId: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: `bank-slot:${itemId}` });
  return (
    <div ref={setNodeRef} className={cn('rounded-lg', isOver && 'ring-2 ring-blue-400')}>
      {children}
    </div>
  );
}

function TierDropZone({
  tier,
  items,
  currentUserId,
  participants,
  failedDuels,
  onDuel,
}: {
  tier: Tier;
  items: Record<string, ImageItem>;
  currentUserId: string;
  participants: Record<string, Participant>;
  failedDuels: Record<string, string[]>;
  onDuel: (itemId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: tier.id });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex min-h-[3.5rem] flex-1 flex-wrap items-center gap-1 p-1.5 transition-colors',
        isOver && 'bg-white/10 ring-inset ring-2 ring-purple-400/60',
      )}
    >
      {tier.itemIds.map((id) => {
        const item = items[id];
        if (!item) return null;
        const isOwnedByOther = item.ownedBy !== null && item.ownedBy !== currentUserId;
        const alreadyLost = (failedDuels[id] ?? []).includes(currentUserId);
        return (
          <TierItemSlot key={id} itemId={id}>
            <DraggableItem
              item={item}
              currentUserId={currentUserId}
              participants={participants}
              canDuel={isOwnedByOther && !alreadyLost}
              onDuel={onDuel}
            />
          </TierItemSlot>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AddTextPopup
// ---------------------------------------------------------------------------

function AddTextPopup({ onAdd, onClose }: { onAdd: (text: string) => void; onClose: () => void }) {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  function submit() {
    value.split(',').map((s) => s.trim()).filter(Boolean).forEach(onAdd);
    onClose();
  }

  return (
    <div style={{ zIndex: Z.modal }} className="fixed inset-0 flex items-end justify-center pb-32 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-72 rounded-xl border border-white/10 bg-game-panel p-3 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="mb-2 text-xs font-bold text-white/50">Add text items (comma-separated)</p>
        <div className="flex gap-1.5">
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onClose(); }}
            maxLength={MAX_TEXT_ITEM_LENGTH}
            placeholder="e.g. Apple, Banana"
            className="game-input flex-1 py-1 text-xs"
          />
          <GameButton variant="primary" size="sm" onClick={submit} disabled={!value.trim()}>
            <Plus size={13} />
          </GameButton>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// BankDropZone
// ---------------------------------------------------------------------------

function BankDropZone({
  bankItemIds,
  items,
  currentUserId,
  participants,
  onUploadFiles,
  onAddText,
}: {
  bankItemIds: string[];
  items: Record<string, ImageItem>;
  currentUserId: string;
  participants: Record<string, Participant>;
  onUploadFiles: (files: FileList) => void;
  onAddText: (text: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'bank' });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showTextPopup, setShowTextPopup] = useState(false);

  // Redirect vertical scroll to horizontal so mouse-wheel users can scroll the bank
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY === 0) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // Combine dnd-kit ref with our scroll ref
  function bankRef(node: HTMLDivElement | null) {
    setNodeRef(node);
    (scrollRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
  }

  return (
    <>
      <div
        ref={bankRef}
        className={cn(
          'flex flex-shrink-0 items-center gap-1.5 overflow-x-auto border-t-2 border-white/10 bg-game-panel/60 px-2 transition-colors',
          'game-scroll',
          isOver && 'border-purple-400/50 bg-purple-900/20',
        )}
        style={{ height: 'calc(6rem + env(safe-area-inset-bottom))', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Controls */}
        <div className="flex flex-shrink-0 flex-col gap-1">
          <GameButton variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()} title={`Upload images (${ACCEPTED_LABEL})`}>
            <Upload size={13} />
          </GameButton>
          <GameButton variant="ghost" size="sm" onClick={() => setShowTextPopup(true)} title="Add text items">
            <Type size={13} />
          </GameButton>
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_ACCEPT}
            multiple
            className="sr-only"
            onChange={(e) => {
              if (e.target.files) onUploadFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        {/* Divider */}
        <div className="h-14 w-px flex-shrink-0 bg-white/10" />

        {/* Items */}
        {bankItemIds.map((id) => {
          const item = items[id];
          if (!item) return null;
          return (
            <BankItemSlot key={id} itemId={id}>
              <DraggableItem
                item={item}
                currentUserId={currentUserId}
                participants={participants}
              />
            </BankItemSlot>
          );
        })}

        {bankItemIds.length === 0 && (
          <span className="select-none text-xs font-semibold text-white/20">
            All items placed
          </span>
        )}
      </div>

      {showTextPopup && (
        <AddTextPopup onAdd={onAddText} onClose={() => setShowTextPopup(false)} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// EditTiersModal
// ---------------------------------------------------------------------------

const TIER_PALETTE = [
  '#FF4444', '#FF8C00', '#FFD700', '#32CD32',
  '#1E90FF', '#9932CC', '#FF69B4', '#00CED1',
];

type LocalTier = { id: string; label: string; color: string };

function EditTiersModal({
  tiers,
  onSave,
  onClose,
}: {
  tiers: Tier[];
  onSave: (tiers: LocalTier[]) => void;
  onClose: () => void;
}) {
  const [localTiers, setLocalTiers] = useState<LocalTier[]>(
    () => tiers.map(({ id, label, color }) => ({ id, label, color })),
  );
  const [modalError, setModalError] = useState<string | null>(null);

  function handleAdd() {
    if (localTiers.length >= MAX_TIERS) {
      setModalError(`Tier limit reached (max ${MAX_TIERS}).`);
      return;
    }
    setModalError(null);
    setLocalTiers((prev) => [
      ...prev,
      { id: crypto.randomUUID(), label: 'New', color: TIER_PALETTE[prev.length % TIER_PALETTE.length] },
    ]);
  }

  function handleDelete(id: string) {
    setLocalTiers((prev) => prev.filter((t) => t.id !== id));
  }

  function handleRename(id: string, label: string) {
    setLocalTiers((prev) => prev.map((t) => (t.id === id ? { ...t, label: label.slice(0, 50) } : t)));
  }

  function handleRecolor(id: string, color: string) {
    setLocalTiers((prev) => prev.map((t) => (t.id === id ? { ...t, color } : t)));
  }

  function handleMove(id: string, dir: 'up' | 'down') {
    setLocalTiers((prev) => {
      const idx = prev.findIndex((t) => t.id === id);
      const next = idx + (dir === 'up' ? -1 : 1);
      if (next < 0 || next >= prev.length) return prev;
      const arr = [...prev];
      [arr[idx], arr[next]] = [arr[next], arr[idx]];
      return arr;
    });
  }

  return (
    <div style={{ zIndex: Z.modal }} className="fixed inset-0 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <Panel className="flex w-full max-w-sm flex-col gap-3 p-5">
        <div className="flex items-center justify-between">
          <span className="font-black text-white">Edit Tiers</span>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white/80 transition-colors text-lg leading-none"
          >
            ✕
          </button>
        </div>

        <div className="flex flex-col gap-2 max-h-64 overflow-y-auto game-scroll pr-1">
          {localTiers.map((tier, idx) => (
            <div key={tier.id} className="flex items-center gap-2">
              {/* Color swatch — clicking opens native color picker */}
              <div className="relative flex-shrink-0 h-7 w-7">
                <div
                  className="h-full w-full rounded-md border-2 border-white/20 cursor-pointer"
                  style={{ backgroundColor: tier.color }}
                />
                <input
                  type="color"
                  value={tier.color}
                  onChange={(e) => handleRecolor(tier.id, e.target.value)}
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  title="Change color"
                />
              </div>

              {/* Label */}
              <input
                type="text"
                value={tier.label}
                maxLength={MAX_TIER_LABEL_LENGTH}
                className={cn('game-input min-w-0 flex-1 py-1 text-sm', !tier.label.trim() && 'ring-1 ring-red-500')}
                onChange={(e) => { handleRename(tier.id, e.target.value); setModalError(null); }}
              />

              {/* Reorder */}
              <div className="flex flex-col">
                <button
                  disabled={idx === 0}
                  onClick={() => handleMove(tier.id, 'up')}
                  className="text-white/40 hover:text-white/80 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronUp size={14} />
                </button>
                <button
                  disabled={idx === localTiers.length - 1}
                  onClick={() => handleMove(tier.id, 'down')}
                  className="text-white/40 hover:text-white/80 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronDown size={14} />
                </button>
              </div>

              {/* Delete */}
              <button
                onClick={() => handleDelete(tier.id)}
                className="flex-shrink-0 text-red-400/60 hover:text-red-400 transition-colors"
                title="Delete tier"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>

        <GameButton
          variant="ghost"
          size="sm"
          onClick={handleAdd}
          className="w-full justify-center gap-1"
        >
          <Plus size={14} /> Add Tier
        </GameButton>

        {modalError && (
          <p className="rounded-lg border border-red-500/40 bg-red-900/30 px-3 py-1.5 text-xs font-semibold text-red-300">
            {modalError}
          </p>
        )}

        <div className="flex gap-2 pt-1 border-t border-white/10">
          <GameButton variant="ghost" size="sm" onClick={onClose} className="flex-1 justify-center">
            Cancel
          </GameButton>
          <GameButton
            variant="success"
            size="sm"
            className="flex-1 justify-center"
            onClick={() => {
              const empty = localTiers.find((t) => !t.label.trim());
              if (empty) { setModalError('All tiers must have a name.'); return; }
              onSave(localTiers);
            }}
          >
            Save Changes
          </GameButton>
        </div>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ExportModal
// ---------------------------------------------------------------------------

function ExportModal({ url, onClose }: { url: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{ zIndex: Z.modal }} className="fixed inset-0 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <Panel className="flex w-full max-w-sm flex-col gap-4 p-5">
        <div className="flex items-center justify-between">
          <span className="font-black text-white">Export Ready</span>
          <button onClick={onClose} className="text-white/40 hover:text-white/80 transition-colors text-lg leading-none">✕</button>
        </div>
        <p className="text-xs text-white/60">
          Open the link below in a browser to download your tier list image.{' '}
          <span className="font-bold text-yellow-400">This link expires in 24 hours.</span>
        </p>
        <div className="flex gap-1.5">
          <input
            readOnly
            value={url}
            className="game-input flex-1 py-1 text-xs"
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
          <GameButton variant="primary" size="sm" onClick={handleCopy}>
            {copied ? '✓' : 'Copy'}
          </GameButton>
        </div>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// End Session Confirm
// ---------------------------------------------------------------------------

function EndSessionConfirm({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div style={{ zIndex: Z.modal }} className="fixed inset-0 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <Panel className="w-full max-w-xs p-6 text-center space-y-4">
        <p className="font-black text-white text-lg">End session?</p>
        <p className="text-sm text-white/60">This will end the game for all players.</p>
        <div className="flex gap-3 justify-center">
          <GameButton variant="ghost" onClick={onCancel}>Cancel</GameButton>
          <GameButton variant="danger" onClick={onConfirm}>End Session</GameButton>
        </div>
      </Panel>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Confetti
// ---------------------------------------------------------------------------

const CONFETTI_COLORS = ['#FF4444', '#FF8C00', '#FFD700', '#32CD32', '#1E90FF', '#9932CC', '#FF69B4', '#00CED1', '#FF6B35', '#4ECDC4', '#ffffff'];

type ConfettiParticle = {
  x: number; y: number; vx: number; vy: number;
  color: string; opacity: number; size: number;
  rotation: number; rotationSpeed: number;
};

function _runConfettiFrame(
  canvasRef: React.RefObject<HTMLCanvasElement>,
  particlesRef: React.MutableRefObject<ConfettiParticle[]>,
  animatingRef: React.MutableRefObject<boolean>,
) {
  const canvas = canvasRef.current;
  if (!canvas) { animatingRef.current = false; return; }
  const ctx = canvas.getContext('2d');
  if (!ctx) { animatingRef.current = false; return; }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  particlesRef.current = particlesRef.current.filter((p) => p.opacity > 0.01);
  for (const p of particlesRef.current) {
    p.vy += 0.13; p.vx *= 0.99;
    p.x += p.vx; p.y += p.vy;
    p.opacity -= 0.011; p.rotation += p.rotationSpeed;
    ctx.save();
    ctx.translate(p.x, p.y); ctx.rotate(p.rotation);
    ctx.globalAlpha = Math.max(0, p.opacity);
    ctx.fillStyle = p.color;
    ctx.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.55);
    ctx.restore();
  }
  if (particlesRef.current.length > 0) {
    requestAnimationFrame(() => _runConfettiFrame(canvasRef, particlesRef, animatingRef));
  } else {
    animatingRef.current = false;
  }
}

function spawnConfettiBurst(
  canvasRef: React.RefObject<HTMLCanvasElement>,
  particlesRef: React.MutableRefObject<ConfettiParticle[]>,
  animatingRef: React.MutableRefObject<boolean>,
  nx: number, ny: number,
) {
  const canvas = canvasRef.current;
  if (!canvas) return;
  const cx = nx * canvas.width;
  const cy = ny * canvas.height;
  for (let i = 0; i < 40; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2.5 + Math.random() * 5.5;
    particlesRef.current.push({
      x: cx, y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 3.5,
      color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
      opacity: 1,
      size: 5 + Math.random() * 6,
      rotation: Math.random() * Math.PI * 2,
      rotationSpeed: (Math.random() - 0.5) * 0.18,
    });
  }
  if (!animatingRef.current) {
    animatingRef.current = true;
    requestAnimationFrame(() => _runConfettiFrame(canvasRef, particlesRef, animatingRef));
  }
}

// ---------------------------------------------------------------------------
// PlayingPage
// ---------------------------------------------------------------------------

export function PlayingPage() {
  const { roomState, socket, currentUserId, isHost, lockRejected, clearLockRejected, activeDuel, clearActiveDuel } = useGame();
  const [activeItem, setActiveItem] = useState<ImageItem | null>(null);
  const [showEditTiers, setShowEditTiers] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [exportUrl, setExportUrl] = useState<string | null>(null);
  const [drawTool, setDrawTool] = useState<'grab' | 'pen' | 'confetti'>('grab');
  const [showDrawBar, setShowDrawBar] = useState(true);
  const [drawingsHidden, setDrawingsHidden] = useState(false);
  const tierListRef = useRef<HTMLDivElement>(null);
  const drawContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const confettiCanvasRef = useRef<HTMLCanvasElement>(null);
  const confettiParticlesRef = useRef<ConfettiParticle[]>([]);
  const confettiAnimatingRef = useRef(false);
  const isDrawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const drawColor = useMemo(() => {
    const palette = ['#FF4444', '#FF8C00', '#FFD700', '#32CD32', '#1E90FF', '#9932CC', '#FF69B4', '#00CED1', '#FF6B35', '#4ECDC4'];
    if (!currentUserId) return palette[0];
    let hash = 0;
    for (let i = 0; i < currentUserId.length; i++) {
      hash = ((hash << 5) - hash) + currentUserId.charCodeAt(i);
      hash |= 0;
    }
    return palette[Math.abs(hash) % palette.length];
  }, [currentUserId]);

  // Size both canvases to match their container; clears on resize (acceptable trade-off)
  useEffect(() => {
    const container = drawContainerRef.current;
    const canvas = canvasRef.current;
    const confetti = confettiCanvasRef.current;
    if (!container || !canvas) return;
    const sync = () => {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
      if (confetti) { confetti.width = container.clientWidth; confetti.height = container.clientHeight; }
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 10 } }),
  );

  // Handle lock rejection
  useEffect(() => {
    if (!lockRejected || !roomState) return;
    setActiveItem(null);
    const name = roomState.participants[lockRejected.lockedBy]?.username ?? 'Someone';
    setToast(`${name} is already moving that item.`);
    clearLockRejected();
  }, [lockRejected, roomState, clearLockRejected]);

  // Surface server-side rejections as toasts
  useEffect(() => {
    if (!socket) return;
    const onUploadRejected = ({ reason }: { reason: string }) => setToast(reason);
    const onTemplatePartial = ({ loaded, total }: { loaded: number; total: number }) =>
      setToast(`Only ${loaded} of ${total} images loaded — room item limit reached.`);
    socket.on('UPLOAD_REJECTED', onUploadRejected);
    socket.on('LOAD_TEMPLATE_PARTIAL', onTemplatePartial);
    return () => {
      socket.off('UPLOAD_REJECTED', onUploadRejected);
      socket.off('LOAD_TEMPLATE_PARTIAL', onTemplatePartial);
    };
  }, [socket]);

  // Receive remote draw events and render onto the shared canvas
  useEffect(() => {
    if (!socket) return;
    const canvas = () => canvasRef.current;
    const ctx = () => canvas()?.getContext('2d') ?? null;

    function onStroke({ x0, y0, x1, y1, color }: { x0: number; y0: number; x1: number; y1: number; color: string }) {
      const c = canvas(); const g = ctx();
      if (!c || !g) return;
      g.beginPath();
      g.moveTo(x0 * c.width, y0 * c.height);
      g.lineTo(x1 * c.width, y1 * c.height);
      g.strokeStyle = color; g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round';
      g.stroke();
    }

    function onDot({ x, y, color }: { x: number; y: number; color: string }) {
      const c = canvas(); const g = ctx();
      if (!c || !g) return;
      g.beginPath();
      g.arc(x * c.width, y * c.height, 1.5, 0, Math.PI * 2);
      g.fillStyle = color; g.fill();
    }

    function onClear() {
      const c = canvas();
      if (!c) return;
      c.getContext('2d')?.clearRect(0, 0, c.width, c.height);
    }

    function onConfetti({ x, y }: { x: number; y: number }) {
      spawnConfettiBurst(confettiCanvasRef, confettiParticlesRef, confettiAnimatingRef, x, y);
    }

    socket.on('DRAW_STROKE', onStroke);
    socket.on('DRAW_DOT', onDot);
    socket.on('DRAW_CLEAR', onClear);
    socket.on('CONFETTI_BURST', onConfetti);
    return () => {
      socket.off('DRAW_STROKE', onStroke);
      socket.off('DRAW_DOT', onDot);
      socket.off('DRAW_CLEAR', onClear);
      socket.off('CONFETTI_BURST', onConfetti);
    };
  }, [socket]);

  if (!roomState || !socket) return null;

  // ── Canvas draw handlers ───────────────────────────────────────────────

  function getCanvasPoint(e: React.PointerEvent): { x: number; y: number } | null {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handleCanvasPointerDown(e: React.PointerEvent) {
    if (drawTool === 'confetti') {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const nx = (e.clientX - rect.left) / canvas.width;
      const ny = (e.clientY - rect.top) / canvas.height;
      spawnConfettiBurst(confettiCanvasRef, confettiParticlesRef, confettiAnimatingRef, nx, ny);
      socket!.emit('CONFETTI_BURST', { x: nx, y: ny });
      return;
    }
    if (drawTool !== 'pen') return;
    const pt = getCanvasPoint(e);
    if (!pt) return;
    isDrawingRef.current = true;
    lastPointRef.current = pt;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx && canvas) {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = drawColor;
      ctx.fill();
      socket!.emit('DRAW_DOT', { x: pt.x / canvas.width, y: pt.y / canvas.height, color: drawColor });
    }
  }

  function handleCanvasPointerMove(e: React.PointerEvent) {
    if (!isDrawingRef.current || drawTool !== 'pen') return;
    const pt = getCanvasPoint(e);
    if (!pt) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (ctx && lastPointRef.current && canvas) {
      ctx.beginPath();
      ctx.moveTo(lastPointRef.current.x, lastPointRef.current.y);
      ctx.lineTo(pt.x, pt.y);
      ctx.strokeStyle = drawColor;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      socket!.emit('DRAW_STROKE', {
        x0: lastPointRef.current.x / canvas.width, y0: lastPointRef.current.y / canvas.height,
        x1: pt.x / canvas.width, y1: pt.y / canvas.height,
        color: drawColor,
      });
    }
    lastPointRef.current = pt;
  }

  function handleCanvasPointerUp() {
    isDrawingRef.current = false;
    lastPointRef.current = null;
  }

  function handleClearCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
    socket!.emit('DRAW_CLEAR');
  }

  // ── Drag handlers ──────────────────────────────────────────────────────

  function handleDragStart(event: DragStartEvent) {
    const item = roomState!.items[event.active.id as string];
    if (!item) return;
    setActiveItem(item);
    socket!.emit('LOCK_ITEM', { itemId: event.active.id });
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveItem(null);

    if (!over) {
      socket!.emit('UNLOCK_ITEM', { itemId: active.id });
      return;
    }

    const overId = over.id as string;

    if (overId === 'bank') {
      socket!.emit('MOVE_ITEM', { itemId: active.id, destination: { type: 'bank' } });
    } else if (overId.startsWith('bank-slot:')) {
      const targetItemId = overId.slice('bank-slot:'.length);
      const index = roomState!.bankItemIds.indexOf(targetItemId);
      if (index !== -1) {
        socket!.emit('MOVE_ITEM', { itemId: active.id, destination: { type: 'bank', index } });
      } else {
        socket!.emit('UNLOCK_ITEM', { itemId: active.id });
      }
    } else if (overId.startsWith('slot:')) {
      const targetItemId = overId.slice(5);
      const tier = roomState!.tiers.find((t) => t.itemIds.includes(targetItemId));
      if (tier) {
        const index = tier.itemIds.indexOf(targetItemId);
        socket!.emit('MOVE_ITEM', { itemId: active.id, destination: { type: 'tier', tierId: tier.id, index } });
      } else {
        socket!.emit('UNLOCK_ITEM', { itemId: active.id });
      }
    } else {
      const tier = roomState!.tiers.find((t) => t.id === overId);
      if (tier) {
        socket!.emit('MOVE_ITEM', {
          itemId: active.id,
          destination: { type: 'tier', tierId: overId, index: tier.itemIds.length },
        });
      } else {
        socket!.emit('UNLOCK_ITEM', { itemId: active.id });
      }
    }
    // Server clears lockedBy in MOVE_ITEM — no extra UNLOCK_ITEM needed
  }

  function handleDragCancel() {
    if (activeItem) socket!.emit('UNLOCK_ITEM', { itemId: activeItem.id });
    setActiveItem(null);
  }

  // ── Host actions ───────────────────────────────────────────────────────

  async function handleExport() {
    const tiers = roomState!.tiers;
    const items = roomState!.items;
    try {
      const SCALE = 2;
      const LABEL_W = 80;
      const ITEM_SIZE = 56;
      const ITEM_GAP = 4;
      const PAD = 6;
      const CANVAS_W = 900;
      const CONTENT_W = CANVAS_W - LABEL_W;
      const ITEMS_PER_ROW = Math.floor((CONTENT_W - PAD * 2 + ITEM_GAP) / (ITEM_SIZE + ITEM_GAP));
      const MIN_TIER_H = ITEM_SIZE + PAD * 2;

      // Pre-load all images in parallel
      const imgMap: Record<string, HTMLImageElement> = {};
      await Promise.all(
        tiers.flatMap((t) => t.itemIds).map((id) => {
          const item = items[id];
          if (!item) return Promise.resolve();
          return new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => { imgMap[id] = img; resolve(); };
            img.onerror = () => resolve();
            img.src = getItemSrc(item);
          });
        }),
      );

      // Calculate exact height per tier based on content
      const tierHeights = tiers.map((tier) => {
        if (tier.itemIds.length === 0) return MIN_TIER_H;
        const rows = Math.ceil(tier.itemIds.length / ITEMS_PER_ROW);
        return Math.max(MIN_TIER_H, rows * (ITEM_SIZE + ITEM_GAP) - ITEM_GAP + PAD * 2);
      });
      const totalH = tierHeights.reduce((a, b) => a + b, 0);

      const HEADER_H = 56;
      const ACCENT_H = 3;

      // Load logo in parallel with images
      const logoImg = await new Promise<HTMLImageElement>((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(img);
        img.src = squareLogoUrl;
      });

      const canvas = document.createElement('canvas');
      canvas.width = CANVAS_W * SCALE;
      canvas.height = (HEADER_H + totalH) * SCALE;
      const ctx = canvas.getContext('2d')!;
      ctx.scale(SCALE, SCALE);

      // Full background
      ctx.fillStyle = '#0f0f1a';
      ctx.fillRect(0, 0, CANVAS_W, HEADER_H + totalH);

      // Header background (slightly lighter)
      ctx.fillStyle = '#0d0d22';
      ctx.fillRect(0, 0, CANVAS_W, HEADER_H);

      // Gradient accent bar along the top
      const grad = ctx.createLinearGradient(0, 0, CANVAS_W, 0);
      grad.addColorStop(0, '#ec4899');
      grad.addColorStop(0.5, '#a855f7');
      grad.addColorStop(1, '#06b6d4');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, CANVAS_W, ACCENT_H);

      // Header separator
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.fillRect(0, HEADER_H - 1, CANVAS_W, 1);

      // Logo + text group, centered
      const LOGO_SIZE = 32;
      const LOGO_GAP = 10;
      const WATERMARK = 'Tier Lists with Friends';
      ctx.font = 'bold 18px sans-serif';
      const groupW = LOGO_SIZE + LOGO_GAP + ctx.measureText(WATERMARK).width;
      const groupX = (CANVAS_W - groupW) / 2;
      const centerY = ACCENT_H + (HEADER_H - ACCENT_H) / 2;

      // Logo clipped to rounded square
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(groupX, centerY - LOGO_SIZE / 2, LOGO_SIZE, LOGO_SIZE, 7);
      ctx.clip();
      ctx.drawImage(logoImg, groupX, centerY - LOGO_SIZE / 2, LOGO_SIZE, LOGO_SIZE);
      ctx.restore();

      // Watermark text
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(WATERMARK, groupX + LOGO_SIZE + LOGO_GAP, centerY);

      let y = HEADER_H;
      for (let i = 0; i < tiers.length; i++) {
        const tier = tiers[i];
        const h = tierHeights[i];
        const borderW = 4;
        const labelAreaW = LABEL_W - borderW;

        // Label background
        ctx.fillStyle = tier.color + '22';
        ctx.fillRect(0, y, LABEL_W, h);

        // Right border
        ctx.fillStyle = tier.color;
        ctx.fillRect(labelAreaW, y, borderW, h);

        // Row separator
        if (i < tiers.length - 1) {
          ctx.fillStyle = 'rgba(255,255,255,0.05)';
          ctx.fillRect(0, y + h - 1, CANVAS_W, 1);
        }

        // Label text — font-size scales with label length, word-wrapped
        const labelPad = 6;
        const availW = labelAreaW - labelPad * 2;
        const rawLabel = tier.label;
        let fontSize = rawLabel.length <= 2 ? 20 : rawLabel.length <= 4 ? 16 : rawLabel.length <= 8 ? 12 : rawLabel.length <= 16 ? 9 : 7;
        ctx.font = `900 ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = tier.color;

        // Build word-wrapped lines
        const words = rawLabel.split(/\s+/);
        const lines: string[] = [];
        let cur = '';
        for (const word of words) {
          const test = cur ? `${cur} ${word}` : word;
          if (cur && ctx.measureText(test).width > availW) { lines.push(cur); cur = word; }
          else cur = test;
        }
        if (cur) lines.push(cur);

        const lineH = fontSize * 1.25;
        const blockH = lines.length * lineH;
        const textY0 = y + h / 2 - blockH / 2 + lineH / 2;
        for (let l = 0; l < lines.length; l++) {
          ctx.fillText(lines[l], labelAreaW / 2, textY0 + l * lineH, availW);
        }

        // Draw items
        let ix = LABEL_W + PAD;
        let iy = y + PAD;
        for (const id of tier.itemIds) {
          const img = imgMap[id];
          ctx.save();
          ctx.beginPath();
          ctx.roundRect(ix, iy, ITEM_SIZE, ITEM_SIZE, 8);
          ctx.clip();
          if (img) {
            ctx.drawImage(img, ix, iy, ITEM_SIZE, ITEM_SIZE);
          } else {
            ctx.fillStyle = 'rgba(255,255,255,0.1)';
            ctx.fillRect(ix, iy, ITEM_SIZE, ITEM_SIZE);
          }
          ctx.restore();

          ix += ITEM_SIZE + ITEM_GAP;
          if (ix + ITEM_SIZE > CANVAS_W - PAD) {
            ix = LABEL_W + PAD;
            iy += ITEM_SIZE + ITEM_GAP;
          }
        }

        y += h;
      }

      const isLocalDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (isLocalDev) {
        const a = document.createElement('a');
        a.href = canvas.toDataURL('image/jpeg', 0.92);
        a.download = `${roomState!.title || 'tier-list'}.jpg`;
        a.click();
      } else {
        const blob = await new Promise<Blob>((resolve, reject) =>
          canvas.toBlob((b) => b ? resolve(b) : reject(new Error('Canvas export failed')), 'image/jpeg', 0.92),
        );
        const res = await fetch('/api/export/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'image/jpeg' },
          body: blob,
        });
        if (!res.ok) {
          const { error } = await res.json() as { error?: string };
          throw new Error(error ?? 'Upload failed');
        }
        const { exportId } = await res.json() as { exportId: string };
        setExportUrl(`${window.location.origin}/api/export/${exportId}`);
      }
    } catch (err) {
      console.error('[export]', err);
      setToast('Export failed. Please try again.');
    }
  }

  function handleSaveTiers(localTiers: LocalTier[]) {
    socket!.emit('SET_TIERS', { tiers: localTiers });
    setShowEditTiers(false);
  }

  function handleEndSession() {
    socket!.emit('END_SESSION');
    setShowEndConfirm(false);
  }

  // ── Upload / template actions (any player) ─────────────────────────────

  async function handleUploadFiles(files: FileList) {
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      try {
        const imageId = await uploadImage(file);
        socket!.emit('UPLOAD_IMAGE', { imageId, fileName: file.name });
      } catch (err) {
        setToast(err instanceof Error ? err.message : `"${file.name}" failed to upload.`);
      }
    }
  }

  function handleAddText(text: string) {
    socket!.emit('ADD_TEXT_ITEM', { text });
  }

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        <div className="flex h-full flex-col overflow-hidden bg-game-bg">
          {/* Top gradient strip — expands to cover iOS status bar safe area */}
          <div
            className="w-full flex-none bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500"
            style={{ height: 'calc(4px + env(safe-area-inset-top))' }}
          />

          {/* Header */}
          <header style={{ zIndex: Z.header }} className="relative flex flex-none items-center justify-between gap-3 border-b border-white/10 bg-game-bg/80 px-4 py-2 backdrop-blur-sm">
            <h1 className="min-w-0 truncate text-base font-black text-white">
              {roomState.title || 'Tier List'}
            </h1>

            <div className="flex flex-shrink-0 items-center gap-2">
              <GameButton
                variant={showDrawBar ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setShowDrawBar((v) => !v)}
                title="Toggle drawing tools"
              >
                <Pencil size={13} />
                <span className="hidden sm:inline">Draw</span>
              </GameButton>
              <PlayerList
                participants={roomState.participants}
                hostId={roomState.hostId}
                currentUserId={currentUserId}
              />
              {isHost && (
                <>
                  <GameButton
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowEditTiers(true)}
                  >
                    <Layers size={13} />
                    <span className="hidden sm:inline">Tiers</span>
                  </GameButton>
                  <GameButton variant="ghost" size="sm" onClick={handleExport}>
                    <Download size={13} />
                    <span className="hidden sm:inline">Export</span>
                  </GameButton>
                  <GameButton
                    variant="danger"
                    size="sm"
                    onClick={() => setShowEndConfirm(true)}
                  >
                    <LogOut size={13} />
                    <span className="hidden sm:inline">End</span>
                  </GameButton>
                </>
              )}
            </div>
          </header>

          {/* Tier list + drawing layer */}
          <div ref={drawContainerRef} className="relative flex-1 overflow-hidden">
            <main ref={tierListRef} className="game-scroll h-full overflow-y-auto bg-game-bg">
              {roomState.tiers.map((tier) => (
                <div
                  key={tier.id}
                  className="flex min-h-[4rem] items-stretch border-b border-white/5"
                >
                  {/* Tier label */}
                  <div
                    className="flex w-[4.5rem] flex-shrink-0 items-center justify-center p-1.5 font-black"
                    style={{
                      backgroundColor: tier.color + '22',
                      borderRight: `4px solid ${tier.color}`,
                    }}
                  >
                    <span
                      style={{
                        color: tier.color,
                        fontSize:
                          tier.label.length <= 2 ? '1.1rem' :
                          tier.label.length <= 4 ? '0.85rem' :
                          tier.label.length <= 8 ? '0.65rem' :
                          tier.label.length <= 16 ? '0.5rem' : '0.4rem',
                        wordBreak: 'break-all',
                        overflowWrap: 'anywhere',
                        textAlign: 'center',
                        lineHeight: 1.2,
                        display: 'block',
                        width: '100%',
                      }}
                    >{tier.label}</span>
                  </div>

                  {/* Drop zone */}
                  <TierDropZone
                    tier={tier}
                    items={roomState.items}
                    currentUserId={currentUserId}
                    participants={roomState.participants}
                    failedDuels={roomState.failedDuels ?? {}}
                    onDuel={(itemId) => socket?.emit('DUEL_CHALLENGE', { itemId })}
                  />
                </div>
              ))}

              {roomState.tiers.length === 0 && (
                <div className="flex h-32 items-center justify-center text-sm font-semibold text-white/30">
                  {isHost ? 'Add tiers using the Tiers button above.' : 'No tiers yet — waiting for the host.'}
                </div>
              )}
            </main>

            {/* Confetti animation canvas — sits above drawing canvas, never receives pointer events */}
            <canvas
              ref={confettiCanvasRef}
              style={{ zIndex: Z.canvasConfetti }}
              className={cn(
                'absolute inset-0 pointer-events-none transition-opacity duration-150',
                drawingsHidden && 'opacity-0',
              )}
            />

            {/* Canvas drawing overlay — pointer-events controlled by active tool */}
            <canvas
              ref={canvasRef}
              style={{ zIndex: Z.canvasBase }}
              className={cn(
                'absolute inset-0 transition-opacity duration-150',
                drawTool === 'pen' || drawTool === 'confetti' ? 'pointer-events-auto' : 'pointer-events-none',
                drawTool === 'pen' && 'cursor-crosshair',
                drawTool === 'confetti' && 'cursor-pointer',
                drawingsHidden && 'opacity-0',
              )}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              onPointerCancel={handleCanvasPointerUp}
            />

            {/* Drawing toolbar — right edge of tier list */}
            {showDrawBar && (
              <div style={{ zIndex: Z.drawToolbar }} className="absolute right-2 top-1/2 flex -translate-y-1/2 flex-col items-center gap-1 rounded-xl border border-white/10 bg-black/70 p-1.5 shadow-2xl backdrop-blur-sm">
                {/* Player color swatch */}
                <div
                  className="h-4 w-4 flex-shrink-0 rounded-full border-2 border-white/30"
                  style={{ backgroundColor: drawColor }}
                  title="Your drawing color"
                />
                <div className="h-px w-full bg-white/10" />
                {/* Grabber */}
                <button
                  onClick={() => setDrawTool('grab')}
                  title="Grabber — drag items"
                  className={cn(
                    'rounded-lg p-1.5 transition-colors',
                    drawTool === 'grab' ? 'bg-purple-600 text-white' : 'text-white/50 hover:bg-white/10 hover:text-white',
                  )}
                >
                  <Hand size={15} />
                </button>
                {/* Pen */}
                <button
                  onClick={() => setDrawTool('pen')}
                  title="Pen — draw on the tier list"
                  className={cn(
                    'rounded-lg p-1.5 transition-colors',
                    drawTool === 'pen' ? 'bg-purple-600 text-white' : 'text-white/50 hover:bg-white/10 hover:text-white',
                  )}
                >
                  <Pencil size={15} />
                </button>
                {/* Confetti */}
                <button
                  onClick={() => setDrawTool('confetti')}
                  title="Confetti — click to celebrate!"
                  className={cn(
                    'rounded-lg p-1.5 transition-colors',
                    drawTool === 'confetti' ? 'bg-purple-600 text-white' : 'text-white/50 hover:bg-white/10 hover:text-white',
                  )}
                >
                  <PartyPopper size={15} />
                </button>
                <div className="h-px w-full bg-white/10" />
                {/* Clear */}
                <button
                  onClick={handleClearCanvas}
                  title="Clear drawings"
                  className="rounded-lg p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-red-400"
                >
                  <Eraser size={15} />
                </button>
                {/* Hide/show drawings */}
                <button
                  onClick={() => setDrawingsHidden((v) => !v)}
                  title={drawingsHidden ? 'Show drawings' : 'Hide drawings'}
                  className={cn(
                    'rounded-lg p-1.5 transition-colors',
                    drawingsHidden ? 'text-white/30 hover:bg-white/10 hover:text-white/60' : 'text-white/50 hover:bg-white/10 hover:text-white',
                  )}
                >
                  {drawingsHidden ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            )}
          </div>

          {/* Image bank */}
          <BankDropZone
            bankItemIds={roomState.bankItemIds}
            items={roomState.items}
            currentUserId={currentUserId}
            participants={roomState.participants}
            onUploadFiles={handleUploadFiles}
            onAddText={handleAddText}
          />
        </div>

        {/* Drag overlay — floating clone */}
        <DragOverlay>
          {activeItem && (
            <DraggableItem
              item={activeItem}
              currentUserId={currentUserId}
              participants={roomState.participants}
              isDragOverlay
            />
          )}
        </DragOverlay>
      </DndContext>

      {/* Modals */}
      {showEditTiers && (
        <EditTiersModal
          tiers={roomState.tiers}
          onSave={handleSaveTiers}
          onClose={() => setShowEditTiers(false)}
        />
      )}

      {showEndConfirm && (
        <EndSessionConfirm
          onConfirm={handleEndSession}
          onCancel={() => setShowEndConfirm(false)}
        />
      )}

      {exportUrl && (
        <ExportModal url={exportUrl} onClose={() => setExportUrl(null)} />
      )}

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}

      {activeDuel && (activeDuel.challengerId === currentUserId || activeDuel.ownerId === currentUserId) && (
        <DuelCutscene
          result={activeDuel}
          participants={roomState.participants}
          currentUserId={currentUserId}
          onDone={clearActiveDuel}
        />
      )}

      <PlayerCursors />
    </>
  );
}
