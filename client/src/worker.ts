interface R2Object {
  key: string;
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
  body: ReadableStream;
}

interface R2Objects {
  objects: R2Object[];
  truncated: boolean;
  cursor?: string;
}

interface R2Bucket {
  put(
    key: string,
    value: ArrayBuffer,
    opts: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> },
  ): Promise<void>;
  get(key: string): Promise<R2Object | null>;
  delete(key: string): Promise<void>;
  list(opts?: { limit?: number; cursor?: string; include?: string[] }): Promise<R2Objects>;
}

interface ScheduledEvent {
  scheduledTime: number;
  cron: string;
}

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  VITE_DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  /** Backend origin. Set in .dev.vars for local dev, Cloudflare dashboard for production. */
  BACKEND_URL: string;
  R2_BUCKET: R2Bucket;
  VITE_IMGBB_API_KEY: string;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// 24 hours in milliseconds
const IMAGE_TTL_MS = 24 * 60 * 60 * 1000;
// 100 KB max after client-side preprocessing
const MAX_UPLOAD_BYTES = 100_000;
// 5 MB max for tier-list export renders
const MAX_EXPORT_BYTES = 5_000_000;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'POST' && url.pathname === '/api/token') {
      let code: string;
      try {
        const body = (await request.json()) as { code?: string };
        code = body.code ?? '';
      } catch {
        return Response.json({ error: 'Invalid request body' }, { status: 400 });
      }

      if (!code) {
        return Response.json({ error: 'Missing code' }, { status: 400 });
      }

      const discordRes = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: env.VITE_DISCORD_CLIENT_ID,
          client_secret: env.DISCORD_CLIENT_SECRET,
          grant_type: 'authorization_code',
          code,
        }),
      });

      const data = (await discordRes.json()) as Record<string, string>;

      if (!discordRes.ok) {
        return Response.json(
          { error: data.error_description ?? data.error ?? 'Discord token exchange failed' },
          { status: discordRes.status },
        );
      }

      return Response.json({ access_token: data.access_token });
    }

    // Upload an image directly to R2. Returns { imageId } which becomes the item id.
    if (request.method === 'POST' && url.pathname === '/api/image/upload') {
      const contentType = request.headers.get('content-type') ?? '';
      if (!contentType.startsWith('image/')) {
        return Response.json({ error: 'Only image/* content types accepted.' }, { status: 400 });
      }

      const body = await request.arrayBuffer();
      if (body.byteLength > MAX_UPLOAD_BYTES) {
        return Response.json({ error: 'Image too large (max 100 KB).' }, { status: 413 });
      }

      const imageId = crypto.randomUUID();
      const expiresAt = String(Date.now() + IMAGE_TTL_MS);

      await env.R2_BUCKET.put(imageId, body, {
        httpMetadata: { contentType },
        customMetadata: { expiresAt },
      });

      return Response.json({ imageId });
    }

    // Serve an uploaded image from R2, proxied through the Worker for Discord CSP.
    const imageMatch = url.pathname.match(/^\/api\/image\/([0-9a-f-]+)$/i);
    if (imageMatch && request.method === 'GET') {
      const id = imageMatch[1];
      if (!UUID_RE.test(id)) {
        return new Response(null, { status: 400 });
      }

      const obj = await env.R2_BUCKET.get(id);
      if (!obj) return new Response(null, { status: 404 });

      const contentType = obj.httpMetadata?.contentType ?? 'image/webp';
      return new Response(obj.body, {
        headers: {
          'Content-Type': contentType,
          'Cache-Control': 'public, max-age=86400',
        },
      });
    }

    // Proxy a tier-list export to imgbb and return the public URL.
    // The Worker makes the outbound request so the client isn't blocked by CSP.
    if (request.method === 'POST' && url.pathname === '/api/export/upload') {
      const body = await request.arrayBuffer();
      if (body.byteLength > MAX_EXPORT_BYTES) {
        return Response.json({ error: 'Export image too large (max 5 MB).' }, { status: 413 });
      }
      const b64 = btoa(String.fromCharCode(...new Uint8Array(body)));
      const form = new FormData();
      form.append('key', env.VITE_IMGBB_API_KEY);
      form.append('image', b64);
      const imgbbRes = await fetch('https://api.imgbb.com/1/upload?expiration=86400', { method: 'POST', body: form });
      const data = await imgbbRes.json() as { success: boolean; data?: { url: string } };
      if (!imgbbRes.ok || !data.success) {
        return Response.json({ error: 'Image host upload failed.' }, { status: 502 });
      }
      return Response.json({ url: data.data!.url });
    }

    // Image proxy — handled entirely at the Worker edge, never touches Render.
    // Fetches directly from TierMaker's CDN with browser-spoofed headers and
    // caches the result for 24 h so each unique image is fetched from CDN once.
    if (url.pathname === '/api/tiermaker/image') {
      const imgUrl = url.searchParams.get('url') ?? '';
      if (!imgUrl.startsWith('https://tiermaker.com/images/')) {
        return Response.json({ error: 'Only tiermaker.com/images/* URLs are accepted.' }, { status: 400 });
      }

      const cache = (caches as unknown as { default: Cache }).default;
      const cached = await cache.match(request);
      if (cached) return cached;

      try {
        const upstream = await fetch(imgUrl, {
          headers: {
            Referer: 'https://tiermaker.com/',
            Origin: 'https://tiermaker.com',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            Accept: 'image/webp,image/apng,image/*,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        });
        if (!upstream.ok) return new Response(null, { status: upstream.status });
        const response = new Response(upstream.body, {
          status: 200,
          headers: {
            'Content-Type': upstream.headers.get('content-type') ?? 'image/jpeg',
            'Cache-Control': 'public, max-age=86400',
          },
        });
        await cache.put(request, response.clone());
        return response;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return Response.json({ error: `Image fetch failed: ${message}` }, { status: 502 });
      }
    }

    // WebSocket proxy for /ws/* — return upstream directly so Cloudflare can
    // forward the 101 Switching Protocols handshake. Wrapping in new Response()
    // breaks the upgrade and forces Socket.IO to stay on HTTP long-polling.
    if (url.pathname.startsWith('/ws/')) {
      const target = (env.BACKEND_URL ?? 'http://localhost:3001').replace(/\/$/, '');
      try {
        return await fetch(`${target}${url.pathname}${url.search}`, {
          method: request.method,
          headers: request.headers,
          body: request.body ?? undefined,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return Response.json({ error: `Proxy error: ${message}` }, { status: 502 });
      }
    }

    // Proxy /api/tiermaker/* to the backend.
    if (url.pathname.startsWith('/api/tiermaker/')) {
      const target = (env.BACKEND_URL ?? 'http://localhost:3001').replace(/\/$/, '');

      try {
        const upstream = await fetch(`${target}${url.pathname}${url.search}`, {
          method: request.method,
          headers: request.headers,
          body: request.body ?? undefined,
        });
        return new Response(upstream.body, {
          status: upstream.status,
          headers: upstream.headers,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return Response.json({ error: `Proxy error: ${message}` }, { status: 502 });
      }
    }

    // All other requests: serve static SPA assets
    return env.ASSETS.fetch(request);
  },

  // Runs every 6 hours. Deletes R2 objects whose expiresAt metadata has passed.
  async scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
    const now = Date.now();
    let cursor: string | undefined;

    do {
      const listed: R2Objects = await env.R2_BUCKET.list({
        limit: 1000,
        include: ['customMetadata'],
        ...(cursor ? { cursor } : {}),
      });

      const expired = listed.objects
        .filter((o: R2Object) => {
          const exp = o.customMetadata?.expiresAt;
          return exp !== undefined && Number(exp) < now;
        })
        .map((o: R2Object) => o.key);

      await Promise.all(expired.map((key: string) => env.R2_BUCKET.delete(key)));

      cursor = listed.truncated ? listed.cursor : undefined;
    } while (cursor);
  },
};
