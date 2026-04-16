# Tier Lists with Friends — MVP Specification

A live, collaborative tier list builder running as a Discord embedded activity. Multiple users in the same voice channel can rank images together in real time.

---

## Running Environment

The app runs inside a **Discord iframe** (embedded activity). Key constraints:

- Fixed `100vw × 100vh` viewport — no scrolling for primary navigation; all UI must fit within this canvas.
- No `window.location` redirects — Discord's iframe sandbox blocks navigation. Use in-app state (phase, modals) for all transitions.
- All user identity and SDK access flows through the `@discord/embedded-app-sdk`. See `DiscordContext.tsx`.

---

## Game Phases

The app has two distinct, server-authoritative phases:

```
SETUP   → Host configures the tier list before play begins
PLAYING → All players interact with the tier list simultaneously
```

`phase` is stored in server-side room state and broadcast to all clients via `STATE_UPDATE`. Clients derive all UI from this field — **never use local React state for phase transitions**.

### SETUP Phase

Only the host sees the setup screen. Other players who join during setup see a waiting screen ("Host is setting up the game…").

The host configures:
- **Title** — name of the tier list
- **Tiers** — add, delete, rename, reorder tiers (default: S, A, B, C, D, F with color per tier)
- **Images** — upload images from their device, or load a TierMaker template

When the host is ready, they click **Start Game**. This emits `START_GAME` to the server, which sets `phase = 'PLAYING'` and broadcasts `STATE_UPDATE` to all connected clients.

### PLAYING Phase

All players can drag items from the image bank onto tiers simultaneously. The host retains additional controls:
- Add, delete, rename, and reorder tiers
- End the session (returns to SETUP, clears all state)
- Export the tier list as a PNG snapshot

Other players have no host controls.

### Ending the Session

The host can click **End Session** at any time during PLAYING. This emits `END_SESSION` to the server. The server deletes the room state and broadcasts `PHASE_RESET` to all clients, returning everyone to the SETUP screen.

---

## Host Role

The **first player to connect** to a channel becomes the host. `hostId` is stored in `RoomState` on the server.

### Host re-election on disconnect

When the host disconnects, the server randomly selects a new host from the remaining connected players and broadcasts `STATE_UPDATE`. If the room is now empty, the server deletes it.

```ts
socket.on('disconnect', () => {
  const room = rooms.get(instanceId);
  if (!room || room.hostId !== userId) return;
  const remaining = [...roomSockets.get(instanceId)].filter(id => id !== userId);
  if (remaining.length === 0) {
    rooms.delete(instanceId);
  } else {
    room.hostId = remaining[Math.floor(Math.random() * remaining.length)];
    io.to(instanceId).emit('STATE_UPDATE', room);
  }
});
```

### Host-only actions (complete list)

| Action | Socket event emitted |
|--------|----------------------|
| Start game | `START_GAME` |
| End session | `END_SESSION` |
| Add / delete / rename / reorder tier | `EDIT_TIER` |
| Export PNG snapshot | (client-only, no socket event) |

Non-host clients must not render any of these controls. Use the pattern:

```tsx
const isHost = roomState.hostId === currentUserId;
if (!isHost) return null;
```

---

## Item Locking — Ownership Model

Locking prevents two players from moving the same item at once. There are two layers:

### 1. Drag-session lock (while actively dragging)

When any player begins dragging an item, the server sets `item.lockedBy = userId` and broadcasts `STATE_UPDATE`. Other players see the item as unavailable (`pointer-events-none opacity-60`) with a tooltip showing who has it.

If another player tries to pick up a locked item, the server emits `LOCK_REJECTED { itemId, lockedBy }` back to that client, which shows a warning.

### 2. Placement ownership (after dropping into a tier)

Once a player **drops an item into a tier row**, they become the **owner** of that item. Ownership persists even after the drag ends:

- `item.lockedBy` is cleared (drag lock released)
- `item.ownedBy` is set to `userId`

Other players **cannot pick up an owned item** — it remains `pointer-events-none` with a tooltip ("Owned by [username]"). Only the original owner can reposition or return the item.

When an owner **returns an item to the image bank** (drops it outside any tier), both `lockedBy` and `ownedBy` are cleared, making it free for anyone to pick up.

This prevents a common race condition where one player places an item into a tier and another player immediately moves it away.

### Lock/ownership events

| Direction | Event | Payload | Effect |
|-----------|-------|---------|--------|
| Client → Server | `LOCK_ITEM` | `{ itemId }` | Sets `lockedBy = userId`, broadcasts |
| Client → Server | `UNLOCK_ITEM` | `{ itemId }` | Clears `lockedBy`, broadcasts |
| Client → Server | `MOVE_ITEM` | `{ itemId, destination }` | Moves item; if destination is a tier, sets `ownedBy = userId`; if destination is `'bank'`, clears `ownedBy`; broadcasts |
| Server → Client | `LOCK_REJECTED` | `{ itemId, lockedBy }` | Client cancels drag, shows warning |

**On player disconnect mid-drag:** server clears `lockedBy` for all items held by that player and moves them back to the bank. `ownedBy` is also cleared so items don't become permanently stuck.

---

## Real-Time Architecture (Socket.IO)

The server owns all authoritative state. Clients emit changes; the server validates, updates, and broadcasts.

### Room model

Clients are grouped into Socket.IO rooms by `discordSdk.instanceId`. Use `instanceId`, not `channelId` — multiple activity instances can run in the same channel simultaneously, and `instanceId` is the correct per-session identifier per Discord's multiplayer docs.

```ts
// client — instanceId is available immediately after DiscordSDK construction, before auth
const instanceId = discordSdk.instanceId;
socket.emit('JOIN_ROOM', { instanceId, userId });

// server — on JOIN_ROOM
socket.join(instanceId);
```

### Server-side state shape

```ts
type ImageItem = {
  id: string;          // uuid
  dataUrl: string;     // base64 data URI (max ~150 KB per image)
  uploadedBy: string;  // userId
  lockedBy: string | null;  // userId currently dragging, or null
  ownedBy: string | null;   // userId who placed it in a tier, or null
};

type Tier = {
  id: string;
  label: string;       // e.g. "S", "A", "B"
  color: string;       // hex
  itemIds: string[];   // ordered list of placed item IDs
};

type RoomState = {
  instanceId: string;
  phase: 'SETUP' | 'PLAYING';
  hostId: string;
  title: string;
  tiers: Tier[];
  items: Record<string, ImageItem>;
  bankItemIds: string[];  // items not yet placed in any tier
};
```

### Full event reference

| Direction | Event | Payload | Notes |
|-----------|-------|---------|-------|
| C→S | `START_GAME` | — | Host only; transitions phase to PLAYING |
| C→S | `END_SESSION` | — | Host only; deletes room, broadcasts PHASE_RESET |
| C→S | `UPLOAD_IMAGE` | `{ dataUrl, fileName }` | Any player; server validates size + item count |
| C→S | `LOAD_TEMPLATE` | `{ items: [{ dataUrl }] }` | Any player during SETUP/PLAYING |
| C→S | `LOCK_ITEM` | `{ itemId }` | Emitted on drag start |
| C→S | `UNLOCK_ITEM` | `{ itemId }` | Emitted on drag cancel/drop to bank |
| C→S | `MOVE_ITEM` | `{ itemId, destination: { tierId \| 'bank', index } }` | Emitted on drop |
| C→S | `EDIT_TIER` | `{ action, tierId?, label?, color?, order? }` | Host only |
| S→C | `STATE_UPDATE` | Full `RoomState` | Broadcast after any mutation |
| S→C | `LOCK_REJECTED` | `{ itemId, lockedBy }` | Sent only to requesting client |
| S→C | `PHASE_RESET` | — | Sent to all on END_SESSION |

---

## Image Bank

The image bank is a **scrollable panel below the tier list**, styled identically to TierMaker's item panel. It holds all images that have not been placed in a tier.

- All players see the same bank state (server-authoritative `bankItemIds`)
- Items in the bank are free to pick up unless currently locked by another player's drag
- When an item is returned from a tier to the bank, it appends to the end of the bank
- The bank scrolls horizontally if items overflow

Layout (fixed viewport):
```
┌──────────────────────────────┐
│        Tier List Grid        │  ← flex-1, overflow-hidden
├──────────────────────────────┤
│         Image Bank           │  ← fixed height ~120px, overflow-x-auto
└──────────────────────────────┘
```

---

## Image Upload & Storage

Images are stored as base64 data URIs in server memory. There is no filesystem or database.

- **Max per image**: 150 KB (enforced both client-side before emit and server-side on receipt)
- **Max items per room**: 100 (server rejects `UPLOAD_IMAGE` if `Object.keys(items).length >= 100`)
- Upload flow: client reads file → base64 → emits `UPLOAD_IMAGE` → server validates → appends to `items` + `bankItemIds` → broadcasts `STATE_UPDATE`

```ts
// client — read file as base64
const reader = new FileReader();
reader.onload = (e) => {
  const dataUrl = e.target?.result as string;
  if (dataUrl.length > 200_000) {
    alert('Image too large (max ~150 KB)');
    return;
  }
  socket.emit('UPLOAD_IMAGE', { dataUrl, fileName: file.name });
};
reader.readAsDataURL(file);
```

**What to tell the user on rejection:**
- Over 150 KB: "Image is too large. Max size is 150 KB."
- Over 100 items: "Room is full (100 items maximum)."

---

## TierMaker Template Loading

Players can load images from an existing TierMaker template via a **modal browser** (host or any player can open it).

### Why a real browser is required

TierMaker's HTML pages sit behind **Cloudflare managed challenge** — plain `fetch` and TLS-fingerprint spoofing tools are both blocked. The challenge injects obfuscated JavaScript that must execute and return a cryptographic proof before the page loads. No HTTP client can bypass this; a real browser is required.

The server connects to **Browserless.io** (managed cloud Chrome) instead of running a local Chromium process. This keeps the server's RAM footprint small (~128 MB) and removes the Chromium binary from the deploy.

```js
// server/tiermaker.js — getBrowser()
import { chromium } from 'playwright-extra';

async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.connectOverCDP(
      `wss://chrome.browserless.io?token=${process.env.BROWSERLESS_TOKEN}`
    );
  }
  return browser;
}
```

Add `BROWSERLESS_TOKEN` to `.env` (get a free token at browserless.io — 1,000 units/month free, ~1 unit per TierMaker search).

TierMaker's image CDN (`tiermaker.com/images/*`) is NOT behind Cloudflare and is proxied with a plain `fetch`.

### Backend routes (already implemented in `server/tiermaker.js` and `server/server.js`)

| Route | Description | Returns |
|-------|-------------|---------|
| `GET /api/tiermaker/search?q=pokemon` | Searches TierMaker, up to 40 results | `[{ url, name, thumbnailUrl, imageCount }]` |
| `GET /api/tiermaker/template?url=https://tiermaker.com/create/...` | Fetches items for one template | `{ name, items: [{ id, imageUrl }] }` |
| `GET /api/tiermaker/image?url=https://tiermaker.com/images/...` | Proxies CDN image as binary. Only `tiermaker.com/images/*` URLs accepted. Cached 24 h. | Binary image |

### Browser UX flow

1. User opens the TierMaker modal
2. Types into search field → client calls `GET /api/tiermaker/search?q=...`
3. Results render as a scrollable list (thumbnail + name + image count)
4. User clicks a template → client calls `GET /api/tiermaker/template?url=...`
5. Template items render in a preview grid using `<img src="/api/tiermaker/image?url=encodeURIComponent(imageUrl)" />`
6. User clicks **Load Template** → client converts each image URL to base64, emits `LOAD_TEMPLATE { items }` via Socket.IO

### Converting TierMaker image URL → base64

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

**Performance note:** The browser connection is a singleton kept alive between requests (`getBrowser()` in `tiermaker.js`). First request ~500 ms (CDP connect); subsequent requests reuse the connection. On `SIGTERM`/`SIGINT`, disconnect gracefully: `await browser.close()`.

**Loading limits:** Respect the 100-item cap. If loading a template would exceed 100 total items, load as many as fit and warn the user.

---

## Tier Management

The host can manage tiers in **both SETUP and PLAYING phases**.

| Action | Behavior |
|--------|----------|
| Add tier | Appends a new tier with a default label and color |
| Delete tier | Removes the tier; all items in it move to the image bank (ownership cleared) |
| Rename tier | Updates `tier.label` |
| Reorder tiers | Drag-and-drop within the tier list; updates `tiers` array order |
| Change tier color | Updates `tier.color` |

Default tiers on new room: **S, A, B, C, D, F** each with a distinct color.

---

## Drag and Drop

Use `@dnd-kit/core` + `@dnd-kit/sortable` for all drag interactions.

`DndContext` wraps the entire board. On `onDragStart`, emit `LOCK_ITEM`. On `onDragEnd`, emit `MOVE_ITEM` (which the server uses to set ownership if dropped in a tier), then emit `UNLOCK_ITEM`. If `LOCK_REJECTED` is received, cancel the drag immediately.

```tsx
<DndContext
  onDragStart={({ active }) => socket.emit('LOCK_ITEM', { itemId: active.id })}
  onDragEnd={({ active, over }) => {
    socket.emit('MOVE_ITEM', { itemId: active.id, destination: over?.id ?? 'bank' });
    socket.emit('UNLOCK_ITEM', { itemId: active.id });
  }}
>
```

Items locked or owned by another player render with `pointer-events-none opacity-60` and a tooltip showing who has them.

---

## Saving the Tier List

The host can export the current tier list as a **PNG image**, downloaded directly to their device.

Use `html2canvas` to capture the tier list DOM node:

```ts
import html2canvas from 'html2canvas';

async function exportSnapshot(tierListRef: React.RefObject<HTMLDivElement>) {
  const canvas = await html2canvas(tierListRef.current!, { useCORS: true });
  const dataUrl = canvas.toDataURL('image/png');
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = 'tier-list.png';
  a.click();
}
```

Since all images are base64 data URIs (not external `<img src="https://...">` URLs), there are no CORS issues with `html2canvas`.

> **Future:** Upload the PNG to Cloudflare and return a shareable download link.

---

## Player Limits

| Limit | Value | Behavior when exceeded |
|-------|-------|------------------------|
| Max players per room | 30 | Server rejects the Socket.IO connection with `CONNECTION_REJECTED { reason: 'Room is full (30 players maximum).' }` |
| Max items per room | 100 | Server rejects `UPLOAD_IMAGE` / `LOAD_TEMPLATE` items beyond 100 with `UPLOAD_REJECTED { reason: 'Room is full (100 items maximum).' }` |
| Max image size | ~150 KB | Server rejects `UPLOAD_IMAGE` with `UPLOAD_REJECTED { reason: 'Image too large (max 150 KB).' }` |

---

## Persistence

There is **no external database**. All state lives in a `rooms` Map on the Express/Socket.IO server, keyed by `instanceId`.

State is lost when:
- All players disconnect (server deletes the room)
- The host ends the session via **End Session**

State persists as long as at least one player remains connected.

---

## Hosting (MVP — Free Tier)

### Architecture

```
Discord Client
     ↓
Discord Proxy (discordsays.com)
     ↓  URL mappings configured in Discord Developer Portal
     ├── /* → Cloudflare Pages  (React/Vite static build)
     └── /api/*, /socket.io/* → Render  (Express + Socket.IO)
```

### Frontend — Cloudflare Pages

The Vite build output is static files regardless of how complex the client-side animations or gameplay become. Deploy to Cloudflare Pages (free, unlimited bandwidth, no credit card):

1. Connect your GitHub repo to Cloudflare Pages
2. Set build command: `npm run build` (run from `client/`)
3. Set publish directory: `client/dist`
4. No environment variables needed on the client beyond what Vite bakes in at build time

### Backend — Render Free Tier

Render's free tier spins down after 15 minutes of no inbound HTTP traffic. Use **UptimeRobot** (free, no credit card) to ping a `/health` endpoint every 5 minutes, preventing spin-down during active use.

```js
// server/server.js — add this route
app.get('/health', (req, res) => res.sendStatus(200));
```

Set up UptimeRobot: New Monitor → HTTP(s) → URL: `https://your-app.onrender.com/health` → interval: 5 minutes.

**Render free tier limits:** 750 instance hours/month (~31 days of continuous uptime for one service). Sufficient for a single always-on server. When you outgrow Render, migrate directly to Fly.io — see [scaling.md](scaling.md).

### TierMaker — Browserless.io Free Tier

Browserless provides managed cloud Chrome. The free tier gives 1,000 units/month (~1 unit per TierMaker search). Add `BROWSERLESS_TOKEN` to Render's environment variables.

### Environment variables (Render dashboard)

| Variable | Value |
|----------|-------|
| `VITE_DISCORD_CLIENT_ID` | Your Discord app's client ID |
| `DISCORD_CLIENT_SECRET` | Your Discord app's client secret |
| `BROWSERLESS_TOKEN` | Token from browserless.io |

### Socket.IO — production URL routing

In production, all traffic routes through Discord's proxy. The Socket.IO client must connect through the proxy, not directly to your Render URL. Call `patchUrlMappings` before connecting the socket:

```ts
// client — before creating the socket connection
await discordSdk.patchUrlMappings([
  { prefix: '/api', target: 'your-app.onrender.com' },
  { prefix: '/socket.io', target: 'your-app.onrender.com' },
]);

const socket = io({ path: '/socket.io' });
```

Configure the matching URL mappings in the Discord Developer Portal under **Activities → URL Mappings**.

### Discord Developer Portal checklist

After deploying:
- **OAuth2 → Redirects**: add your Cloudflare Pages URL
- **Activities → URL Mappings**: map `/api/*` and `/socket.io/*` to your Render URL, and `/*` to your Cloudflare Pages URL
