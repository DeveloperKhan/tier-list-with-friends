# Tier List with Friends — Claude Code Guide

A live, collaborative tier list builder Discord activity. Multiple Discord users in the same voice channel can rank items together in real time.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite 5 |
| Styling | Tailwind CSS v3 + `clsx`/`tailwind-merge` |
| Discord | `@discord/embedded-app-sdk` ^1.4.2 |
| Backend | Express (Node.js) — token exchange + WebSocket hub |
| Realtime | Socket.IO (to be added) |
| Tunnel | `cloudflared` for local development |

## Project Structure

```
tier-list-with-friends/
├── client/                         # Vite + React app (served in Discord iframe)
│   ├── src/
│   │   ├── context/
│   │   │   └── DiscordContext.tsx  # Auth state + SDK singleton — import useDiscord()
│   │   ├── lib/
│   │   │   └── utils.ts            # cn() Tailwind merge helper
│   │   ├── App.tsx                 # Root component — guarded by auth status
│   │   ├── main.tsx                # React entry point + DiscordProvider mount
│   │   └── index.css               # Tailwind directives + base styles
│   ├── vite.config.ts              # Proxy /api → localhost:3001, HMR port 443
│   ├── tailwind.config.ts          # Discord brand colors extended
│   └── tsconfig.json
├── server/
│   └── server.js                   # Express — POST /api/token (OAuth code exchange)
├── .env                            # VITE_DISCORD_CLIENT_ID + DISCORD_CLIENT_SECRET
└── example.env                     # Template — copy to .env and fill in values
```

## Discord SDK Auth Flow

Every component that needs user identity or SDK access should call `useDiscord()`. Always check `status` before reading `discordSdk`:

```tsx
import { useDiscord } from '@/context/DiscordContext';

function MyComponent() {
  const discord = useDiscord();
  if (discord.status !== 'ready') return null;

  const { user, discordSdk, accessToken } = discord;
  // safe to use discordSdk here
}
```

**Auth sequence (runs once in `DiscordProvider`):**

1. `discordSdk.ready()` — signals the app is loaded inside the iframe
2. `discordSdk.commands.authorize({ scopes })` — opens OAuth popup, returns `code`
3. `POST /api/token` → server exchanges `code` for `access_token` using `DISCORD_CLIENT_SECRET`
4. `discordSdk.commands.authenticate({ access_token })` — SDK is now fully authenticated

**Never create more than one `DiscordSDK` instance.** It's a singleton in `DiscordContext.tsx`.

## Participant Tracking

Subscribe to participant events after the SDK is ready:

```tsx
useEffect(() => {
  if (discord.status !== 'ready') return;

  async function loadParticipants() {
    const { participants } = await discord.discordSdk.commands.getInstanceConnectedParticipants();
    setParticipants(participants);
  }

  discord.discordSdk.subscribe(
    'ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE',
    ({ participants }) => setParticipants(participants),
  );

  loadParticipants();
}, [discord.status]);
```

## Realtime Multiplayer (Socket.IO)

The server owns authoritative tier list state. Clients emit changes; server broadcasts to all participants.

```
Client emits:  MOVE_ITEM  { itemId, tier, position }
Server stores: tierListState[channelId]
Server emits:  STATE_UPDATE { tierList }  → all clients in room
```

Group clients into Socket.IO rooms by `discordSdk.channelId` so only participants in the same voice channel share state.

```ts
// server — join room on connect
socket.join(channelId);

// client — emit after user drags an item
socket.emit('MOVE_ITEM', { itemId, tier, position });

// client — apply authoritative updates
socket.on('STATE_UPDATE', ({ tierList }) => setTierList(tierList));
```

## Environment Variables

| Variable | Where used | Description |
|----------|-----------|-------------|
| `VITE_DISCORD_CLIENT_ID` | client + server | Public OAuth2 client ID |
| `DISCORD_CLIENT_SECRET` | server only | **Never expose to the browser** |

Copy `example.env` → `.env` and fill in values from the [Discord Developer Portal](https://discord.com/developers/applications).

## Local Development Setup

### 1. Install dependencies
```bash
cd client && npm install
cd ../server && npm install
```

### 2. Configure `.env`
```bash
cp example.env .env
# Fill in VITE_DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET
```

### 3. Start services (3 terminals)

```bash
# Terminal 1 — backend (port 3001)
cd server && npm run dev

# Terminal 2 — frontend (port 5173)
cd client && npm run dev

# Terminal 3 — public tunnel (required for Discord iframe)
cloudflared tunnel --url http://localhost:5173
```

### 4. Update Discord Developer Portal
After cloudflared prints a URL (e.g. `https://abc123.trycloudflare.com`):
- **OAuth2 → Redirects**: add the tunnel URL
- **Activities → URL Mappings**: set Root Mapping target to the tunnel URL

> The tunnel URL changes every cloudflared restart — update the portal each time.

### 5. Test in Discord
Open a voice channel → Start Activity → select your app.

## Vite Proxy

`/api/*` requests from the client are proxied to `http://localhost:3001` by Vite. This means:
- Client calls `fetch('/api/token', ...)` during development
- In production, put a real reverse proxy (nginx / Railway routing) in front

## Tailwind Conventions

- Use the `cn()` helper from `@/lib/utils` for conditional classes:
  ```ts
  import { cn } from '@/lib/utils';
  <div className={cn('base-class', isActive && 'active-class')} />
  ```
- Custom Discord colors are in `tailwind.config.ts` under `theme.extend.colors.discord`.

## MVP Architecture

### Game Phases

The app has two distinct phases managed as server-authoritative state:

```
SETUP   → Host configures title, tiers, images
PLAYING → All players drag items; host can edit tiers
```

Phase is part of the room state and stored on the server. Clients derive all UI from the phase field — do not use local React state for phase transitions.

```ts
type Phase = 'SETUP' | 'PLAYING';
```

### Server-Side In-Memory State Shape

**There is no external database.** All state lives in a `rooms` Map on the Express/Socket.IO server, keyed by `channelId`. When everyone disconnects, or the host resets, the state is deleted.

```ts
type ImageItem = {
  id: string;          // uuid
  dataUrl: string;     // base64 data URI — stored server-side, max ~100KB per image
  uploadedBy: string;  // userId
  lockedBy: string | null;  // userId currently dragging, or null
};

type Tier = {
  id: string;
  label: string;       // "A", "B", etc.
  color: string;       // hex
  itemIds: string[];   // ordered list of item IDs placed in this tier
};

type RoomState = {
  channelId: string;
  phase: 'SETUP' | 'PLAYING';
  hostId: string;                // userId of current host
  tiers: Tier[];                 // ordered; default [S, A, B, C, D]
  items: Record<string, ImageItem>; // all images (bank + placed)
  bankItemIds: string[];         // items not yet placed in any tier
};
```

**Limits enforced on the server:**
- Max 30 players per room (reject Socket.IO connection if room is full)
- Max 100 items per room (reject `UPLOAD_IMAGE` if `Object.keys(items).length >= 100`)

### Host Role

The first player to connect becomes the host. The `hostId` is stored in `RoomState`.

**Host re-election when host disconnects:**
```ts
// server — on disconnect
socket.on('disconnect', () => {
  const room = rooms.get(channelId);
  if (!room || room.hostId !== userId) return;
  const remaining = [...roomSockets.get(channelId)].filter(id => id !== userId);
  if (remaining.length === 0) {
    rooms.delete(channelId); // clean up empty room
  } else {
    room.hostId = remaining[Math.floor(Math.random() * remaining.length)];
    io.to(channelId).emit('STATE_UPDATE', room);
  }
});
```

**Client-side host guard — use this pattern for any host-only action:**
```tsx
import { useGame } from '@/context/GameContext'; // wraps RoomState + socket

function HostOnlyButton({ onClick, children }) {
  const { roomState, currentUserId } = useGame();
  const isHost = roomState.hostId === currentUserId;
  if (!isHost) return null;
  return <button onClick={onClick}>{children}</button>;
}
```

### Item Locking

Only one player can move an item at a time. Locking is **server-authoritative** — the server accepts or rejects lock requests.

```
LOCK_ITEM   { itemId }  → server sets item.lockedBy = userId, broadcasts STATE_UPDATE
UNLOCK_ITEM { itemId }  → server clears item.lockedBy, broadcasts STATE_UPDATE
MOVE_ITEM   { itemId, destination: { tierId | 'bank', index } }
```

Lock request is rejected (server sends back `LOCK_REJECTED { itemId, lockedBy }`) if `item.lockedBy !== null`. Client shows a warning message on rejection.

Items are automatically unlocked (moved back to bank + lock cleared) if a player disconnects mid-drag.

### Drag and Drop

Use `@dnd-kit/core` + `@dnd-kit/sortable` for all drag-and-drop interactions.

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

Pattern: `DndContext` wraps the whole board. On `onDragStart`, emit `LOCK_ITEM`. On `onDragEnd`, emit `MOVE_ITEM` + `UNLOCK_ITEM`. If `LOCK_REJECTED` is received, cancel the drag immediately.

```tsx
<DndContext
  onDragStart={({ active }) => socket.emit('LOCK_ITEM', { itemId: active.id })}
  onDragEnd={({ active, over }) => {
    socket.emit('MOVE_ITEM', { itemId: active.id, destination: over?.id ?? 'bank' });
    socket.emit('UNLOCK_ITEM', { itemId: active.id });
  }}
>
```

Items locked by another player should render with `pointer-events-none opacity-60` and a tooltip showing who has it.

### Image Upload & Storage

Images are stored as base64 data URIs in server memory (no filesystem, no DB).

- **Max file size**: 150 KB per image (enforced client-side before upload and server-side on receipt)
- **Max items**: 100 total per room
- Upload flow: client reads file as base64 → emits `UPLOAD_IMAGE { dataUrl, fileName }` → server validates size + item count → appends to `items` + `bankItemIds` → broadcasts `STATE_UPDATE`

```ts
// client — read file as base64
const reader = new FileReader();
reader.onload = (e) => {
  const dataUrl = e.target?.result as string;
  if (dataUrl.length > 200_000) return alert('Image too large (max ~150KB)');
  socket.emit('UPLOAD_IMAGE', { dataUrl, fileName: file.name });
};
reader.readAsDataURL(file);
```

### TierMaker Template Loading

TierMaker's pages sit behind **Cloudflare managed challenge** — simple HTTP fetches and plain headless Chromium are both blocked. The server uses `playwright-extra` + `puppeteer-extra-plugin-stealth` to run a real browser that passes the challenge automatically. TierMaker's image CDN (`tiermaker.com/images/*`) is NOT behind Cloudflare and is proxied with a plain `fetch`.

**Implemented in `server/tiermaker.js`. Three backend routes:**

| Route | Description |
|-------|-------------|
| `GET /api/tiermaker/search?q=pokemon` | Returns up to 40 matching templates: `[{ url, name, thumbnailUrl, imageCount }]` |
| `GET /api/tiermaker/template?url=https://tiermaker.com/create/...` | Returns items for one template: `{ name, items: [{ id, imageUrl }] }` |
| `GET /api/tiermaker/image?url=https://tiermaker.com/images/...` | Proxies a CDN image as binary. Only `tiermaker.com/images/*` URLs accepted. |

**How the client uses these:**

1. User opens TierMaker modal → types into search field
2. Client calls `GET /api/tiermaker/search?q=...` → renders result grid
3. User clicks a template → client calls `GET /api/tiermaker/template?url=...`
4. Display item images using `<img src="/api/tiermaker/image?url=encodeURIComponent(imageUrl)" />`
5. On confirm → convert each image to base64, emit `LOAD_TEMPLATE { items }` via Socket.IO

**Converting image URL → base64 on the client (for loading into game state):**

```ts
async function imageUrlToBase64(imageUrl: string): Promise<string> {
  const proxyUrl = `/api/tiermaker/image?url=${encodeURIComponent(imageUrl)}`;
  const res = await fetch(proxyUrl);
  const blob = await res.blob();
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}
```

**Performance note:** The Playwright browser is kept alive as a singleton between requests (`getBrowser()` in `tiermaker.js`). First request takes ~2 s to launch Chromium; subsequent requests use the running browser and take ~500 ms. The browser is closed gracefully on `SIGTERM`/`SIGINT`.

### Snapshot Export

Use `html2canvas` to capture the tier list DOM node and export it as a PNG data URL.

```bash
npm install html2canvas
```

```ts
import html2canvas from 'html2canvas';

async function exportSnapshot(tierListRef: React.RefObject<HTMLDivElement>) {
  const canvas = await html2canvas(tierListRef.current!, { useCORS: true });
  const dataUrl = canvas.toDataURL('image/png');
  // Open in new tab or trigger download
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = 'tier-list.png';
  a.click();
}
```

Only the host sees the export button. Since images are base64 data URIs (not `<img src="https://...">`) there are no CORS issues with `html2canvas`.

### Required Packages (not yet installed)

**Client:**
```bash
cd client && npm install socket.io-client @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities html2canvas
```

**Server:**
```bash
cd server && npm install socket.io
```

## Key Constraints

- **Fixed viewport**: The activity runs inside a Discord iframe. Do not rely on scrolling for primary navigation; design for a fixed `100vw × 100vh` canvas.
- **HMR port 443**: `vite.config.ts` sets `hmr.clientPort: 443` — required for hot reload to work through the cloudflared HTTPS tunnel.
- **No `window.location` redirects**: Discord's iframe sandbox blocks navigation. Use in-app state for routing.
- **React StrictMode double-invoke**: `DiscordContext.tsx` uses a `useRef` guard to prevent running the auth flow twice.
- **Socket.IO path is `/ws`, not `/socket.io`**: Discord URL mapping prefixes cannot contain periods, so Socket.IO is mounted at `/ws`. The server sets `path: "/ws"` in the `Server` constructor. The client must connect with `io({ path: "/ws" })`. The `patchUrlMappings` call must use `{ prefix: "/ws", target: "..." }` — never `/socket.io`.
