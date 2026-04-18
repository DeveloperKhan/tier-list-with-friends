import { useEffect, useRef, useState } from 'react';
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
import { GameButton } from '@/components/ui/GameButton';
import { Panel } from '@/components/ui/Panel';
import { PlayerList } from '@/components/ui/PlayerList';
import { cn, getItemSrc } from '@/lib/utils';
import { ChevronDown, ChevronUp, Download, Layers, LogOut, Plus, Trash2, Type, Upload } from 'lucide-react';

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3000);
    return () => clearTimeout(t);
  }, [onDismiss]);

  return (
    <div className="fixed bottom-36 left-1/2 z-50 -translate-x-1/2 animate-bounce-in rounded-xl border-2 border-red-500/50 bg-red-900/80 px-4 py-2 text-sm font-bold text-white shadow-2xl backdrop-blur-sm">
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

}: {
  item: ImageItem;
  currentUserId: string;
  participants: Record<string, Participant>;
  isDragOverlay?: boolean;
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

  const blockerName =
    isLockedByOther
      ? (participants[item.lockedBy!]?.username ?? 'Someone')
      : isOwnedByOther
        ? (participants[item.ownedBy!]?.username ?? 'Someone')
        : null;

  const tooltip = isLockedByOther
    ? `Being moved by ${blockerName}`
    : isOwnedByOther
      ? `Owned by ${blockerName}`
      : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      title={tooltip}
{...(canInteract && !isDragOverlay ? { ...attributes, ...listeners } : {})}
      className={cn(
        'relative aspect-square w-14 flex-shrink-0 overflow-hidden rounded-lg bg-white/10',
        canInteract && !isDragOverlay && 'cursor-grab active:cursor-grabbing touch-none',
        isLockedByOther && 'pointer-events-none opacity-50',
        isOwnedByOther && 'pointer-events-none opacity-75 ring-1 ring-white/20',
        isDragging && !isDragOverlay && 'opacity-0',
        isDragOverlay && 'scale-105 cursor-grabbing shadow-2xl ring-2 ring-purple-400',
      )}
    >
      <img
        src={getItemSrc(item)}
        alt={item.fileName}
        draggable={false}
        className="h-full w-full object-cover"
      />
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

function TierDropZone({
  tier,
  items,
  currentUserId,
  participants,
}: {
  tier: Tier;
  items: Record<string, ImageItem>;
  currentUserId: string;
  participants: Record<string, Participant>;
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
        return (
          <TierItemSlot key={id} itemId={id}>
            <DraggableItem
              item={item}
              currentUserId={currentUserId}
              participants={participants}

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
    <div className="fixed inset-0 z-50 flex items-end justify-center pb-32 bg-black/40 backdrop-blur-sm" onClick={onClose}>
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
  const [showTextPopup, setShowTextPopup] = useState(false);

  return (
    <>
      <div
        ref={setNodeRef}
        className={cn(
          'flex flex-shrink-0 items-center gap-1.5 overflow-x-auto border-t-2 border-white/10 bg-game-panel/60 px-2 transition-colors',
          'game-scroll',
          isOver && 'border-purple-400/50 bg-purple-900/20',
        )}
        style={{ height: 'calc(6rem + env(safe-area-inset-bottom))', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {/* Controls */}
        <div className="flex flex-shrink-0 flex-col gap-1">
          <GameButton variant="ghost" size="sm" onClick={() => fileInputRef.current?.click()} title="Upload images">
            <Upload size={13} />
          </GameButton>
          <GameButton variant="ghost" size="sm" onClick={() => setShowTextPopup(true)} title="Add text items">
            <Type size={13} />
          </GameButton>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
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
            <DraggableItem
              key={id}
              item={item}
              currentUserId={currentUserId}
              participants={participants}

            />
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

  function handleAdd() {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
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
                maxLength={50}
                className="game-input min-w-0 flex-1 py-1 text-sm"
                onChange={(e) => handleRename(tier.id, e.target.value)}
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

        <div className="flex gap-2 pt-1 border-t border-white/10">
          <GameButton variant="ghost" size="sm" onClick={onClose} className="flex-1 justify-center">
            Cancel
          </GameButton>
          <GameButton variant="success" size="sm" onClick={() => onSave(localTiers)} className="flex-1 justify-center">
            Save Changes
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
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
// PlayingPage
// ---------------------------------------------------------------------------

export function PlayingPage() {
  const { roomState, socket, currentUserId, isHost, lockRejected, clearLockRejected } = useGame();
  const [activeItem, setActiveItem] = useState<ImageItem | null>(null);
  const [showEditTiers, setShowEditTiers] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const tierListRef = useRef<HTMLDivElement>(null);

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

  if (!roomState || !socket) return null;

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
    if (!tierListRef.current) return;
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(tierListRef.current, { useCORS: true });
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = `${roomState!.title || 'tier-list'}.png`;
      a.click();
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

  function handleUploadFiles(files: FileList) {
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        if (dataUrl.length > 200_000) {
          setToast(`"${file.name}" is too large (max ~150 KB).`);
          return;
        }
        socket!.emit('UPLOAD_IMAGE', { dataUrl, fileName: file.name });
      };
      reader.readAsDataURL(file);
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
          <header className="flex flex-none items-center justify-between gap-3 border-b border-white/10 bg-game-bg/80 px-4 py-2 backdrop-blur-sm">
            <h1 className="min-w-0 truncate text-base font-black text-white">
              {roomState.title || 'Tier List'}
            </h1>

            <div className="flex flex-shrink-0 items-center gap-2">
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

          {/* Tier list */}
          <main ref={tierListRef} className="game-scroll flex-1 overflow-y-auto bg-game-bg">
            {roomState.tiers.map((tier) => (
              <div
                key={tier.id}
                className="flex min-h-[4rem] items-stretch border-b border-white/5"
              >
                {/* Tier label */}
                <div
                  className="flex w-14 flex-shrink-0 items-center justify-center p-1 font-black"
                  style={{
                    backgroundColor: tier.color + '22',
                    borderRight: `4px solid ${tier.color}`,
                  }}
                >
                  <span
                    style={{
                      color: tier.color,
                      fontSize: tier.label.length <= 2 ? '1.1rem' : tier.label.length <= 4 ? '0.8rem' : '0.6rem',
                      wordBreak: 'break-all',
                      overflowWrap: 'anywhere',
                      textAlign: 'center',
                      lineHeight: 1.15,
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
                />
              </div>
            ))}

            {roomState.tiers.length === 0 && (
              <div className="flex h-32 items-center justify-center text-sm font-semibold text-white/30">
                {isHost ? 'Add tiers using the Tiers button above.' : 'No tiers yet — waiting for the host.'}
              </div>
            )}
          </main>

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

      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}

      <PlayerCursors />
    </>
  );
}
