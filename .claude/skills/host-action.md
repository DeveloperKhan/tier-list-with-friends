---
name: host-action
description: Implement a host-only action — UI that only the host sees, socket event the server enforces
---

Host-only features follow a two-layer guard: the client hides UI from non-hosts, and the server rejects the socket event if the sender is not the current host. Never rely on client-side guarding alone.

## Client pattern — hide UI from non-hosts

Access `roomState.hostId` and `currentUserId` from `GameContext`:

```tsx
import { useGame } from '@/context/GameContext';

function HostControls() {
  const { roomState, currentUserId } = useGame();
  if (roomState.hostId !== currentUserId) return null;

  return (
    <div className="flex gap-2">
      {/* Only host sees this */}
      <button onClick={() => socket.emit('START_GAME')}>Start</button>
      <button onClick={() => socket.emit('EXPORT_SNAPSHOT')}>Save</button>
    </div>
  );
}
```

## Server pattern — reject if not host

```ts
socket.on('HOST_ONLY_EVENT', (payload) => {
  const room = rooms.get(channelId);
  if (!room || room.hostId !== userId) {
    socket.emit('ERROR', { message: 'Only the host can do that.' });
    return;
  }
  // Proceed with the action
  applyChange(room, payload);
  io.to(channelId).emit('STATE_UPDATE', room);
});
```

## Host-only events in this MVP

| Event | Payload | Effect |
|-------|---------|--------|
| `START_GAME` | — | Sets `phase = 'PLAYING'` |
| `SET_TIER_TITLE` | `{ title }` | Updates `roomState.title` |
| `ADD_TIER` | `{ label, color }` | Appends tier to `tiers[]` |
| `DELETE_TIER` | `{ tierId }` | Removes tier; returns its items to bank |
| `REORDER_TIERS` | `{ orderedTierIds }` | Reorders `tiers[]` |
| `RENAME_TIER` | `{ tierId, label }` | Updates `tier.label` |
| `EXPORT_SNAPSHOT` | — | Server-acknowledged; client triggers `html2canvas` |
| `RESET_GAME` | — | Clears room state, returns to SETUP phase |

## Host re-election (already implemented in server)

When the host disconnects, a random remaining player becomes host and `STATE_UPDATE` is broadcast. No client action needed — the UI will automatically adjust because `hostId` changed in `roomState`.

Now implement the specific host-only feature the user described, adding both the client UI guard and the server-side enforcement.
