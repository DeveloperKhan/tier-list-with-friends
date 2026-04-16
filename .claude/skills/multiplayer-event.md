---
name: multiplayer-event
description: Add a new real-time multiplayer event to the tier list activity (Socket.IO)
---

Add a new Socket.IO event to the tier list activity. Events follow a client-emit / server-broadcast pattern. The server owns authoritative state; clients optimistically update then reconcile on `STATE_UPDATE`.

## Naming convention

| Direction | Format | Example |
|-----------|--------|---------|
| Client → Server | `VERB_NOUN` | `MOVE_ITEM`, `ADD_TIER`, `RENAME_ITEM` |
| Server → Client | `NOUN_UPDATE` or `STATE_UPDATE` | `TIER_UPDATE`, `STATE_UPDATE` |

## Server-side pattern (`server/server.js` or `server/src/app.ts`)

```ts
io.on('connection', (socket) => {
  const { channelId } = socket.handshake.auth;
  socket.join(channelId); // room = voice channel

  socket.on('NEW_EVENT_NAME', (payload) => {
    // 1. Validate payload
    // 2. Mutate authoritative state for this room
    roomState[channelId] = applyChange(roomState[channelId], payload);
    // 3. Broadcast to everyone in the room (including sender)
    io.to(channelId).emit('STATE_UPDATE', { tierList: roomState[channelId] });
  });
});
```

## Client-side pattern

```tsx
// Emit (e.g. after user drags an item)
socket.emit('NEW_EVENT_NAME', { /* payload */ });

// Receive authoritative state
useEffect(() => {
  socket.on('STATE_UPDATE', ({ tierList }) => {
    setTierList(tierList);
  });
  return () => { socket.off('STATE_UPDATE'); };
}, []);
```

## Connect socket with Discord auth

```tsx
import { io } from 'socket.io-client';
import { useDiscord } from '@/context/DiscordContext';

const discord = useDiscord();
if (discord.status === 'ready') {
  const socket = io('/', {
    auth: {
      channelId: discord.discordSdk.channelId,
      userId: discord.user.id,
      token: discord.accessToken,
    },
  });
}
```

Now implement the specific event the user described, adding both the server handler and the client hook/effect.
