---
name: item-lock
description: Implement the per-item player locking mechanic — only one player can move an item at a time
---

Item locking is **server-authoritative**. The server accepts or rejects lock requests; the client never assumes it has a lock until the server confirms via `STATE_UPDATE`.

## Lock lifecycle

```
Player starts drag  →  emit LOCK_ITEM { itemId }
                           ↓
                    Server: is item.lockedBy null?
                      YES → set lockedBy = userId, broadcast STATE_UPDATE
                      NO  → emit LOCK_REJECTED { itemId, lockedBy } to requester only
                           ↓
Player ends drag    →  emit MOVE_ITEM { itemId, destination }
                        emit UNLOCK_ITEM { itemId }
                           ↓
                    Server: apply move, clear lockedBy, broadcast STATE_UPDATE
```

## Server implementation

```ts
socket.on('LOCK_ITEM', ({ itemId }) => {
  const room = rooms.get(channelId);
  const item = room?.items[itemId];
  if (!item) return;

  if (item.lockedBy !== null) {
    socket.emit('LOCK_REJECTED', { itemId, lockedBy: item.lockedBy });
    return;
  }

  item.lockedBy = userId;
  io.to(channelId).emit('STATE_UPDATE', room);
});

socket.on('UNLOCK_ITEM', ({ itemId }) => {
  const room = rooms.get(channelId);
  const item = room?.items[itemId];
  if (!item || item.lockedBy !== userId) return;
  item.lockedBy = null;
  io.to(channelId).emit('STATE_UPDATE', room);
});

socket.on('MOVE_ITEM', ({ itemId, destination }) => {
  const room = rooms.get(channelId);
  const item = room?.items[itemId];
  // Only the lock holder can move it
  if (!item || item.lockedBy !== userId) return;
  applyMove(room, itemId, destination); // update tiers[].itemIds and bankItemIds
  item.lockedBy = null;
  io.to(channelId).emit('STATE_UPDATE', room);
});

// Auto-unlock all items held by a disconnecting player
socket.on('disconnect', () => {
  const room = rooms.get(channelId);
  if (!room) return;
  Object.values(room.items).forEach(item => {
    if (item.lockedBy === userId) item.lockedBy = null;
  });
  io.to(channelId).emit('STATE_UPDATE', room);
});
```

## Client — @dnd-kit integration

```tsx
import { DndContext, DragOverlay } from '@dnd-kit/core';
import { useGame } from '@/context/GameContext';

function TierBoard() {
  const { socket } = useGame();
  const [activeItemId, setActiveItemId] = useState<string | null>(null);

  return (
    <DndContext
      onDragStart={({ active }) => {
        setActiveItemId(String(active.id));
        socket.emit('LOCK_ITEM', { itemId: active.id });
      }}
      onDragEnd={({ active, over }) => {
        if (over) {
          socket.emit('MOVE_ITEM', { itemId: active.id, destination: over.id });
        }
        socket.emit('UNLOCK_ITEM', { itemId: active.id });
        setActiveItemId(null);
      }}
      onDragCancel={({ active }) => {
        socket.emit('UNLOCK_ITEM', { itemId: active.id });
        setActiveItemId(null);
      }}
    >
      {/* Tier rows + image bank here */}
      <DragOverlay>{/* ghost image while dragging */}</DragOverlay>
    </DndContext>
  );
}
```

## Client — render lock state

```tsx
function ItemCard({ item }: { item: ImageItem }) {
  const { currentUserId } = useGame();
  const isLockedByOther = item.lockedBy !== null && item.lockedBy !== currentUserId;

  return (
    <div
      className={cn(
        'relative rounded cursor-grab',
        isLockedByOther && 'opacity-50 pointer-events-none cursor-not-allowed',
      )}
      title={isLockedByOther ? `In use by another player` : undefined}
    >
      <img src={item.dataUrl} className="h-16 w-16 object-cover rounded" />
      {isLockedByOther && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded">
          <span className="text-xs text-white">🔒</span>
        </div>
      )}
    </div>
  );
}
```

## Handling LOCK_REJECTED

```tsx
socket.on('LOCK_REJECTED', ({ lockedBy }) => {
  // Show a brief toast — do not start the drag
  showToast(`That item is being moved by someone else`);
  // @dnd-kit: cancel the drag by not calling setActiveItemId
});
```

Now implement the item locking for the specific component or interaction the user described.
