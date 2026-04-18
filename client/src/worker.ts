interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  VITE_DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
  /** Backend origin. Set in .dev.vars for local dev, Cloudflare dashboard for production. */
  BACKEND_URL: string;
}

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

    // Proxy /api/tiermaker/* and /ws/* to the backend.
    if (url.pathname.startsWith('/api/tiermaker/') || url.pathname.startsWith('/ws/')) {
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
};
