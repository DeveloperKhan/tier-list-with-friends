# Scaling Guide

The MVP runs free on Render + Cloudflare Pages. This document is the complete upgrade path — from a single free instance to multi-region horizontal scale — with exact file changes at each step.

---

## Architecture overview

The codebase is deliberately split so that each scaling bottleneck maps to exactly one file swap:

| Bottleneck | File to replace | Migration section |
|---|---|---|
| Server RAM (room state) | `server/store.js` | [Redis adapter](#2-add-redis-for-multi-instance-state) |
| Server RAM (image blobs) | `server/images.js` | [Offload images to R2](#3-offload-images-to-r2) |
| Single-process throughput | `server/server.js` (add adapter) | [Redis adapter](#2-add-redis-for-multi-instance-state) |
| Free-tier spin-down / IP bans | Deployment platform | [Migrate to Fly.io](#1-migrate-to-flyio) |

---

## When to act

| Signal | Action |
|---|---|
| Sessions drop after inactivity (Render spin-down) | Migrate to Fly.io |
| Cloudflare banning Render's shared IPs on Discord API calls | Migrate to Fly.io (static outbound IP) |
| Single VM memory > 80% under load | Add Redis + scale to 2 VMs |
| `STATE_UPDATE` payloads are large / slow to broadcast | Offload images to R2 |
| Sidecar search latency > 3 s under load | Raise `MAX_CONCURRENT_PAGES` or add a second sidecar VM |
| Sidecar OOMing | Lower `MAX_CONCURRENT_PAGES` or upsize to 2 GB VM |

---

## 1. Migrate to Fly.io

**Cost: ~$12/mo.** Do this before anything else — it buys you a persistent process, a static outbound IP, and zero-downtime deploys.

```
Frontend  →  Cloudflare Pages   (unchanged, stays free)
Backend   →  Fly.io 1 GB VM
Sidecar   →  Fly.io 512 MB VM   (or Browserless.io free tier)
```

### Cost breakdown

| Component | $/mo |
|---|---|
| shared-cpu-1x, 1 GB RAM (backend) | $5.92 |
| Dedicated inbound IPv4 | $2.00 |
| Static outbound IP | $3.60 |
| **Total** | **~$11.52** |

### Deploy steps

```bash
# From the repo root — deploy backend
cd server
npm install -g flyctl
fly auth login
fly launch        # detects Node.js, writes fly.toml
fly secrets set \
  DISCORD_CLIENT_SECRET=... \
  VITE_DISCORD_CLIENT_ID=... \
  TIERMAKER_SIDECAR_URL=https://your-sidecar.fly.dev
fly deploy
```

Minimum `fly.toml` for the backend — prevents the instance scaling to zero (which would drop Socket.IO connections):

```toml
[http_service]
  internal_port = 3001
  force_https = true
  min_machines_running = 1
  auto_stop_machines = false

[[vm]]
  memory = "1gb"
  cpu_kind = "shared"
  cpus = 1
```

After deploy, update the Discord Developer Portal URL mappings from `your-app.onrender.com` → `your-app.fly.dev`. No frontend changes needed.

### Deploy the sidecar separately

The Playwright sidecar runs a real headless Chromium process and is memory-heavy (~300–500 MB for Chromium alone). Run it as a separate Fly app so it doesn't compete with the Socket.IO server for RAM.

```bash
cd sidecar
fly launch --name my-app-sidecar
fly secrets set PORT=3002
fly deploy
```

```toml
# sidecar fly.toml — 1 GB gives comfortable headroom for MAX_CONCURRENT_PAGES=3
[[vm]]
  memory = "1gb"
  cpu_kind = "shared"
  cpus = 1

[http_service]
  internal_port = 3002
  force_https = true
  min_machines_running = 1
  auto_stop_machines = false
```

Set `TIERMAKER_SIDECAR_URL` in the backend secrets to the sidecar's Fly URL.

---

## 2. Add Redis for multi-instance state

**Only needed when a single 1 GB VM is saturated.** A single Node.js process handles ~3,000–5,000 concurrent Socket.IO connections before you need this.

### Why the migration is a one-file swap

`server/store.js` is the in-memory implementation of the state store. Every function is already `async` — all handlers `await` state reads and writes. Replacing the file with a Redis implementation requires zero changes to any handler.

Current interface (`server/store.js`):

```js
// Rooms
export async function getRoom(instanceId)         // → RoomState | null
export async function setRoom(instanceId, room)   // → void
export async function deleteRoom(instanceId)      // → void

// Room socket maps  (instanceId → Map<socketId, userId>)
export async function getRoomSockets(instanceId)
export async function setRoomSockets(instanceId, map)
export async function deleteRoomSockets(instanceId)

// Per-socket metadata  (socketId → { instanceId, userId })
export async function getSocketInfo(socketId)
export async function setSocketInfo(socketId, info)
export async function deleteSocketInfo(socketId)

// Pending disconnect timers — sync, not Redis-portable (see note below)
export function getPendingDisconnect(key)
export function setPendingDisconnect(key, timer)
export function deletePendingDisconnect(key)
```

### Step 1 — Add Upstash Redis

Upstash free tier: 10,000 req/day — sufficient for a hobby Discord activity. Paid starts at $0.20 per 100k requests.

```bash
cd server
npm install ioredis @socket.io/redis-adapter
```

Set the secret:

```bash
fly secrets set UPSTASH_REDIS_URL=rediss://:password@your-db.upstash.io:6380
```

### Step 2 — Replace server/store.js

Replace the entire file with a Redis-backed implementation. The `Map`-based socket tracking stays in-memory (socket IDs are local to the process; use sticky sessions or the Redis adapter's built-in routing so each socket always hits the same node):

```js
// server/store.js  — Redis implementation
import { createClient } from 'ioredis';

const redis = createClient(process.env.UPSTASH_REDIS_URL);
const ROOM_TTL = 86_400; // 24 h — rooms auto-expire if server crashes

// In-memory socket maps — local to each process, Redis adapter handles routing
const roomSockets = new Map();
const socketInfo = new Map();
const pendingDisconnects = new Map();

// Rooms — serialised to Redis
export async function getRoom(instanceId) {
  const raw = await redis.get(`room:${instanceId}`);
  return raw ? JSON.parse(raw) : null;
}
export async function setRoom(instanceId, room) {
  await redis.set(`room:${instanceId}`, JSON.stringify(room), 'EX', ROOM_TTL);
}
export async function deleteRoom(instanceId) {
  await redis.del(`room:${instanceId}`);
}

// Room socket maps — keep in-memory (process-local)
export async function getRoomSockets(instanceId) {
  return roomSockets.get(instanceId) ?? null;
}
export async function setRoomSockets(instanceId, map) {
  roomSockets.set(instanceId, map);
}
export async function deleteRoomSockets(instanceId) {
  roomSockets.delete(instanceId);
}

// Socket info — keep in-memory (process-local)
export async function getSocketInfo(socketId) {
  return socketInfo.get(socketId) ?? null;
}
export async function setSocketInfo(socketId, info) {
  socketInfo.set(socketId, info);
}
export async function deleteSocketInfo(socketId) {
  socketInfo.delete(socketId);
}

// Pending disconnect timers — process-local, not Redis-portable
export function getPendingDisconnect(key) { return pendingDisconnects.get(key); }
export function setPendingDisconnect(key, timer) { pendingDisconnects.set(key, timer); }
export function deletePendingDisconnect(key) { pendingDisconnects.delete(key); }
```

### Step 3 — Add the Socket.IO Redis adapter

In `server/server.js`, add the adapter after creating the `io` instance (lines 22–30):

```js
// server/server.js — add after `const io = new Server(...)`
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'ioredis';

const pubClient = createClient(process.env.UPSTASH_REDIS_URL);
const subClient = pubClient.duplicate();
await Promise.all([pubClient.connect(), subClient.connect()]);
io.adapter(createAdapter(pubClient, subClient));
```

The adapter syncs `io.to(room).emit(...)` calls across all instances — each process only has to broadcast to its own local sockets.

### Step 4 — Scale to two VMs

```bash
fly scale count 2
```

**Total cost: ~$17.44/mo** ($11.52 + $5.92 for the second VM).

### Note on pending disconnect timers

`pendingDisconnects` stores `NodeJS.Timeout` handles, which are not serialisable to Redis. When running two instances, a disconnect on instance A starts a timer on instance A. If that instance crashes before the timer fires, the grace period is lost and the user is not evicted — the room stays alive but with a stale participant entry. Acceptable trade-off for a hobby app. To fix it properly, replace the timer with a Redis-backed delayed job (e.g. BullMQ + Redis).

---

## 3. Offload images to R2

**Do this independently of Redis — it helps even on a single VM.** Upload images are stored as base64 blobs in `server/images.js`. These blobs are not in `STATE_UPDATE` (they're served via `GET /api/image/:id`), but they still consume server RAM at ~150 KB each × up to 100 items per room.

### Why the migration is a one-file swap

`server/images.js` has a four-function interface. All handlers call it via `await`. Replacing the file with an R2 implementation requires no handler changes.

Current interface (`server/images.js`):

```js
export async function put(id, dataUrl)    // store a base64 data URI by item ID
export async function get(id)             // retrieve it — null if missing
export async function del(id)             // delete one image
export async function delMany(ids)        // batch delete (room cleanup)
```

The HTTP route that serves images lives in `server/routes/image.js` and calls `images.get(id)` — it also requires no changes.

### Step 1 — Create an R2 bucket

```bash
# Cloudflare dashboard → R2 → Create bucket → name it "tier-list-images"
# Generate an R2 API token with Object Read & Write permissions
```

```bash
cd server
npm install @aws-sdk/client-s3
fly secrets set \
  R2_ACCOUNT_ID=... \
  R2_ACCESS_KEY_ID=... \
  R2_SECRET_ACCESS_KEY=... \
  R2_BUCKET=tier-list-images
```

### Step 2 — Replace server/images.js

```js
// server/images.js — R2 implementation
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const Bucket = process.env.R2_BUCKET;

export async function put(id, dataUrl) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) throw new Error('Invalid dataUrl');
  const [, ContentType, b64] = match;
  await r2.send(new PutObjectCommand({
    Bucket, Key: id,
    Body: Buffer.from(b64, 'base64'),
    ContentType,
  }));
}

export async function get(id) {
  try {
    const res = await r2.send(new GetObjectCommand({ Bucket, Key: id }));
    const buf = Buffer.from(await res.Body.transformToByteArray());
    return `data:${res.ContentType};base64,${buf.toString('base64')}`;
  } catch {
    return null;
  }
}

export async function del(id) {
  await r2.send(new DeleteObjectCommand({ Bucket, Key: id }));
}

export async function delMany(ids) {
  await Promise.all(ids.map(del));
}
```

`server/routes/image.js` calls `images.get(id)` and returns the data URI — no changes needed there. Alternatively, generate a presigned R2 URL and redirect the client, which avoids the server buffering the image on every request:

```js
// server/routes/image.js — presigned redirect variant (optional upgrade)
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

router.get('/:id', async (req, res) => {
  const url = await getSignedUrl(r2, new GetObjectCommand({ Bucket, Key: req.params.id }), { expiresIn: 3600 });
  res.redirect(302, url);
});
```

---

## 4. Scaling the Playwright sidecar

### How it works

The sidecar (`sidecar/tiermaker.js`) runs a **single persistent Chromium browser** via `playwright-extra` + the stealth plugin. This is required because TierMaker's HTML pages sit behind a Cloudflare managed challenge — plain HTTP fetches are blocked. The stealth plugin makes Chromium appear indistinguishable from a real user browser.

Each TierMaker search or template load:
1. Opens a new browser page (`browser.newPage()`)
2. Navigates to TierMaker and waits ~2 s for deferred content to render
3. Scrapes the DOM and returns results
4. Closes the page

**Cost per call:** ~500 ms–2 s of Playwright time + ~80–150 MB of RAM while the page is open.

With a typical session — 100 players each doing ~10 searches — that's 1,000 potential Playwright calls, but they're spread across 5–10 minutes of the setup phase. Peak concurrency is usually 5–15 simultaneous searches, not 100.

### Built-in scaling in sidecar/tiermaker.js

Three mechanisms are already implemented and require no infrastructure changes:

**1. In-memory cache** (biggest win)

Search results are cached for 1 hour; template items for 24 hours. Popular queries ("pokemon", "anime", etc.) are almost always cache hits after the first player searches them. In practice this reduces Playwright calls by 70–90%.

```js
// sidecar/tiermaker.js
const SEARCH_TTL  = 60 * 60 * 1000;        // 1 hour
const TEMPLATE_TTL = 24 * 60 * 60 * 1000;  // 24 hours
```

**2. Request coalescing**

If 5 players search "pokemon" simultaneously, only one Playwright page opens. The other 4 await the same in-flight promise.

```js
// sidecar/tiermaker.js — _inflight Map
async function dedupe(key, fn) {
  if (_inflight.has(key)) return _inflight.get(key);
  const p = fn().finally(() => _inflight.delete(key));
  _inflight.set(key, p);
  return p;
}
```

**3. Concurrency limiter**

At most `MAX_CONCURRENT_PAGES` Playwright pages are open at once. Excess requests queue and are served as pages close. This prevents OOM from a burst of cache-miss searches.

```js
// sidecar/tiermaker.js
const MAX_CONCURRENT_PAGES = 3; // tune based on VM RAM
```

Rule of thumb: each open page uses ~80–150 MB. On a 1 GB VM with ~400 MB for Chromium itself, MAX 3–4 concurrent pages is safe.

### Tuning MAX_CONCURRENT_PAGES

| Sidecar VM RAM | Safe MAX_CONCURRENT_PAGES |
|---|---|
| 512 MB | 1–2 |
| 1 GB | 3–4 |
| 2 GB | 6–8 |

Change the constant at the top of `sidecar/tiermaker.js` and redeploy. No other changes needed.

### When one sidecar VM isn't enough

If cache hit rate is low (lots of long-tail unique queries) and the queue is backing up, add a second sidecar VM. Because the cache is in-memory (not shared), each instance maintains its own cache — this is fine, it just means the warm-up period is per-instance.

Route requests between sidecar instances using consistent hashing on the query string so that the same query always lands on the same instance and gets a cache hit:

```js
// server/routes/tiermaker.js — multi-sidecar routing
const SIDECAR_URLS = process.env.TIERMAKER_SIDECAR_URLS?.split(',') ?? [process.env.TIERMAKER_SIDECAR_URL];

function pickSidecar(key) {
  // djb2 hash → consistent instance selection
  let h = 5381;
  for (const c of key) h = ((h << 5) + h) ^ c.charCodeAt(0);
  return SIDECAR_URLS[Math.abs(h) % SIDECAR_URLS.length];
}

// Then in the route handler:
const sidecarUrl = pickSidecar(req.query.q ?? req.query.url ?? '');
```

Set `TIERMAKER_SIDECAR_URLS` to a comma-separated list of sidecar URLs in the backend secrets.

**Cost:** second sidecar VM (1 GB) — **+$5.92/mo**.

---

## Cost ceiling summary

| Setup | Monthly |
|---|---|
| MVP (Render free) | $0 |
| Fly.io: backend 1 GB + sidecar 1 GB | ~$17 |
| + R2 images (< 10 GB stored) | ~$18 |
| + Upstash Redis + second backend VM | ~$23 |
| + second sidecar VM | ~$29 |

---

## Migration order

The steps above are independent and additive. Recommended order:

1. **Fly.io** — eliminates spin-down and IP bans; no code changes
2. **Tune `MAX_CONCURRENT_PAGES`** in `sidecar/tiermaker.js` based on observed sidecar memory — free, no deploy needed beyond the constant change
3. **R2 images** — reduces backend RAM; one-file swap in `server/images.js`
4. **Redis + second backend VM** — only if a single backend VM is saturated; one-file swap in `server/store.js` + four lines in `server/server.js`
5. **Second sidecar VM + consistent-hash routing** — only if sidecar queue is backing up despite caching
