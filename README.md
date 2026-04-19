# Tier Lists with Friends

A live, collaborative tier list builder for Discord voice channels. Multiple players in the same voice channel drag and drop images into tiers together in real time.

Built on the [Discord Embedded App SDK](https://discord.com/developers/docs/activities/overview).

---

## Prerequisites

| Tool | Purpose |
|------|---------|
| Node.js ≥ 18 | Runtime for client and server |
| [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) | HTTPS tunnel for Discord testing |
| Discord app credentials | From the [Developer Portal](https://discord.com/developers/applications) |

---

## Environment variables

Copy the template and fill in your credentials:

```bash
cp example.env .env
```

| Variable | Required for | Description |
|----------|-------------|-------------|
| `VITE_DISCORD_CLIENT_ID` | Discord testing | OAuth2 Client ID (safe to expose) |
| `DISCORD_CLIENT_SECRET` | Discord testing | OAuth2 Client Secret — **never commit, never expose to the browser** |

Both values are found in your app's **OAuth2** page in the Discord Developer Portal.

> Local browser testing works without setting either variable — the mock SDK does not contact Discord.

---

## Running locally (browser, no Discord)

The app detects whether it is running inside Discord's iframe by checking for the `frame_id` query parameter that Discord injects. When `frame_id` is absent the app automatically switches to **mock mode**: `DiscordSDKMock` is used in place of `DiscordSDK`, the OAuth flow is skipped entirely, and a synthetic dev user is provided. No credentials or tunnel are needed.

```bash
# Terminal 1 — backend (port 3001)
cd server && npm run dev

# Terminal 2 — frontend (port 5173)
cd client && npm run dev
```

Open **http://localhost:5173** in your browser. You will see a loading spinner briefly ("Starting local dev session…") and then the app.

**Mock session IDs** (guild, channel, user) are generated once per browser session and stored in `sessionStorage`. They persist across HMR reloads but reset when you open a new tab.

---

## Testing inside Discord

Testing inside Discord requires a public HTTPS URL because Discord loads activities in a sandboxed iframe that only accepts TLS connections. `cloudflared` provides a free tunnel for this.

### 1. Start the servers with tunnel mode enabled

```bash
# Terminal 1 — backend (port 3001)
cd server && npm run dev

# Terminal 2 — frontend (port 5173) with HMR wired to the tunnel port
cd client && VITE_TUNNEL=true npm run dev

# Terminal 3 — public tunnel
cloudflared tunnel --url http://localhost:5173
```

`cloudflared` will print a URL like `https://abc123.trycloudflare.com`. Copy it.

> The tunnel URL **changes every time** cloudflared restarts. You must update the Developer Portal each time (step 2).

### 2. Update the Discord Developer Portal

In your app settings at [discord.com/developers/applications](https://discord.com/developers/applications):

- **OAuth2 → Redirects** — add the cloudflared URL (e.g. `https://abc123.trycloudflare.com`)
- **Activities → URL Mappings** — set the Root Mapping target to the same URL

### 3. Test in a voice channel

1. Join a voice channel in any server where your app is installed
2. Click **Start Activity** and select your app
3. The activity loads in Discord's iframe with real auth

---

## Why two modes exist

| | Local (mock) | Discord (real) |
|-|-------------|----------------|
| **SDK** | `DiscordSDKMock` | `DiscordSDK` |
| **Auth** | Skipped — fake user returned | Full OAuth: `authorize → /api/token → authenticate` |
| **HMR** | Default Vite (ws → localhost) | `VITE_TUNNEL=true` (ws → port 443 via tunnel) |
| **Credentials needed** | No | Yes — `.env` must be filled |
| **Access** | `http://localhost:5173` | Via cloudflared URL in a Discord voice channel |

The switch is automatic and lives entirely in `client/src/context/DiscordContext.tsx`. Both modes share identical app code — no `if (dev)` branches outside the context file.

---

## Project structure

```
tier-list-with-friends/
├── client/                         # React 18 + TypeScript + Vite 5 + Tailwind v3
│   ├── src/
│   │   ├── context/
│   │   │   └── DiscordContext.tsx  # SDK singleton, mock detection, auth flow
│   │   ├── components/
│   │   │   └── TierMakerBrowser.tsx
│   │   ├── lib/
│   │   │   └── utils.ts            # cn() Tailwind helper
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── vite.config.ts              # Proxy /api → :3001; HMR conditional on VITE_TUNNEL
│   └── tailwind.config.ts
├── server/                         # Express + Node.js
│   ├── server.js                   # OAuth token exchange + TierMaker API routes
│   └── tiermaker.js                # Playwright scraper + image proxy
├── docs/
│   └── mvp.md
├── .env                            # Local secrets — never commit
└── example.env                     # Template
```

---

## Server architecture

The server is a single Node.js process (`server/server.js`) running Express + Socket.IO.

### HTTP routes

| Route | Description |
|-------|-------------|
| `POST /api/token` | Discord OAuth2 code exchange — returns `access_token` |
| `GET /api/tiermaker/search?q=` | TierMaker template search (Playwright) |
| `GET /api/tiermaker/template?url=` | TierMaker template items (Playwright) |
| `GET /api/tiermaker/image?url=` | CDN image proxy (plain fetch) |
| `POST /api/export/upload` | Uploads a JPEG canvas snapshot to ImgBB, returns public URL |
| `GET /health` | Health check |

### Socket.IO

- **Path:** `/ws` (not `/socket.io` — Discord URL mappings cannot contain periods)
- **Parser:** `socket.io-msgpack-parser` on both server and client — all messages encoded with MessagePack, ~20–40% smaller than JSON
- **Compression:** `perMessageDeflate: false` — disabled intentionally; deflate wastes CPU with no gain on small payloads
- **Rooms:** clients join a room keyed by `discordSdk.instanceId`; state is isolated per room

### Handler modules (`server/handlers/`)

| File | Responsibility |
|------|----------------|
| `room.js` | `JOIN_ROOM`, `START_GAME`, `END_SESSION` — room lifecycle and phase transitions |
| `items.js` | `LOCK_ITEM`, `UNLOCK_ITEM`, `MOVE_ITEM`, `UPLOAD_IMAGE`, `ADD_TEXT_ITEM`, `LOAD_TEMPLATE` |
| `tiers.js` | `EDIT_TIER`, `SET_TIERS` |
| `cursor.js` | `CURSOR_MOVE` — encodes as 3-byte binary buffer |
| `draw.js` | `DRAW_STROKE`, `DRAW_DOT`, `DRAW_CLEAR`, `CONFETTI_BURST` — relayed as-is |
| `duel.js` | `DUEL_CHALLENGE` — rock-paper-scissors item ownership mechanic |
| `disconnect.js` | Grace-period reconnect window; host re-election; orphaned lock cleanup |

### Bandwidth design

Real-time events are split into two tiers to keep outbound traffic low:

**Full `STATE_UPDATE`** (entire room snapshot) — sent only for structural changes: join/leave, phase transition, tier edits, template loads, new items, and a 30-second reconciliation heartbeat.

**Targeted delta events** — sent for high-frequency changes:

| Event | Payload | Replaces |
|-------|---------|---------|
| `ITEM_LOCK_CHANGED` | `{ itemId, lockedBy }` | ~80 bytes vs full STATE_UPDATE |
| `ITEM_MOVED` | `{ itemId, tierId, index, ownedBy }` | ~120 bytes vs full STATE_UPDATE |

**Cursor updates** use a 3-byte binary buffer `[playerIndex, x_uint8, y_uint8]` and are only emitted during active interactions (pen drawing, image dragging, confetti clicks) — not on general mouse movement.

### In-memory state

There is no database. All room state lives in a `Map` on the server keyed by `instanceId`. Rooms are deleted when empty or after an 8-hour lifetime cap. Images are stored as base64 data URIs in a separate `Map` keyed by UUID, served via `GET /api/image/:id`.

---

## TierMaker API (backend)

The server exposes three endpoints for browsing and loading TierMaker templates. TierMaker's HTML pages are behind Cloudflare, so a headless Playwright browser is used server-side. Images are served from a CDN that does not require a browser and are proxied directly.

| Endpoint | Description |
|----------|-------------|
| `GET /api/tiermaker/search?q=` | Returns up to 40 matching templates |
| `GET /api/tiermaker/template?url=` | Returns items for a specific template |
| `GET /api/tiermaker/image?url=` | Proxies a CDN image (only `tiermaker.com/images/*` accepted) |

The Playwright browser is kept alive as a singleton between requests. The first request after starting the server takes ~2 s to launch Chromium; subsequent requests take ~500 ms.
