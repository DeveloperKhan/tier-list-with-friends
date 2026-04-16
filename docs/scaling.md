# Scaling Guide

The MVP runs free on Render + Cloudflare Pages. When that's no longer sufficient, there is one upgrade path: **migrate to Fly.io**. Everything stays under $20/month.

---

## When to migrate off Render

Migrate when you hit any of these:

- The server is getting Cloudflare IP bans on Discord API calls (Render uses dynamic, shared IPs)
- You need zero-downtime deploys
- You need to run more than one server instance
- The UptimeRobot keep-alive is unreliable and sessions are dropping

There is no intermediate step — skip straight to Fly.io.

---

## Fly.io — the only upgrade (~$12/mo)

```
Frontend  →  Cloudflare Pages  (unchanged, stays free)
Backend   →  Fly.io
TierMaker →  Browserless.io free tier  (unchanged)
```

### Cost breakdown

| Component | Cost |
|-----------|------|
| shared-cpu-1x, 1 GB RAM VM | $5.92/mo |
| Dedicated inbound IPv4 | $2.00/mo |
| Static outbound IP | $3.60/mo |
| **Total** | **~$11.52/mo** |

This is the ceiling. The only thing that changes this number is adding a second VM instance (another $5.92/mo), which would only be needed at a scale unlikely for a Discord activity.

### Deploy

```bash
# from the server directory
npm install -g flyctl
fly auth login
fly launch        # detects Node.js, generates fly.toml
fly secrets set \
  DISCORD_CLIENT_SECRET=... \
  VITE_DISCORD_CLIENT_ID=... \
  BROWSERLESS_TOKEN=...
fly deploy
```

Set `min_machines_running = 1` so the instance never scales to zero and drops Socket.IO connections:

```toml
# fly.toml
[http_service]
  internal_port = 3001
  force_https = true
  min_machines_running = 1
```

Update Discord Developer Portal URL mappings from `your-app.onrender.com` → `your-app.fly.dev`. The Cloudflare Pages frontend does not change.

Remove the UptimeRobot monitor — it's no longer needed.

---

## If you ever need two instances (Redis adapter)

This is only relevant if a single 1 GB VM is genuinely saturated, which would require a very large number of simultaneous active rooms. If you get there:

**Add Upstash Redis** (free tier: 10,000 requests/day — sufficient for a hobby app):

```bash
npm install @socket.io/redis-adapter ioredis
```

```js
// server/server.js
import { createAdapter } from '@socket.io/redis-adapter';
import { createClient } from 'ioredis';

const pubClient = createClient({ url: process.env.UPSTASH_REDIS_URL });
const subClient = pubClient.duplicate();
await Promise.all([pubClient.connect(), subClient.connect()]);
io.adapter(createAdapter(pubClient, subClient));
```

Move room state from the in-memory `rooms` Map to Redis so all instances share it:

```js
// write
await pubClient.set(`room:${instanceId}`, JSON.stringify(roomState), 'EX', 86400);

// read
const roomState = JSON.parse(await pubClient.get(`room:${instanceId}`));

// delete
await pubClient.del(`room:${instanceId}`);
```

Then scale to two VMs:

```bash
fly scale count 2
```

Cost: ~$11.52 + $5.92 = **~$17.44/mo** — still under $20.

---

## Browserless.io free tier running out

The free tier gives 1,000 units/month (~1,000 TierMaker searches). If that runs out, self-host the open-source Browserless Docker image as a second Fly.io VM:

```bash
# second app in the same Fly.io org
fly launch --image ghcr.io/browserless/chromium --name my-app-browserless
```

A shared-cpu-1x 512 MB VM runs Browserless fine for low-volume scraping: **+$1.94/mo**.

Update `BROWSERLESS_TOKEN` to point at your self-hosted instance URL instead of browserless.io.

Total with self-hosted Browserless: **~$13.46/mo**.

---

## Cost ceiling summary

| Setup | Monthly |
|-------|---------|
| MVP (Render free) | $0 |
| Fly.io single instance | ~$12 |
| Fly.io + self-hosted Browserless | ~$14 |
| Fly.io × 2 instances + Upstash Redis free | ~$17 |
| Fly.io × 2 + self-hosted Browserless + Upstash | ~$19 |

The $20 ceiling holds across all realistic scenarios for a Discord activity.
