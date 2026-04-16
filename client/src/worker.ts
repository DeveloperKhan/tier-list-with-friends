interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
  VITE_DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
}

const BACKEND_URL = `https://commissioners-pace-martial-cooperative.trycloudflare.com`;

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

    // Proxy /api/tiermaker/* and /ws/* to the backend tunnel.
    // The Worker runs server-side so it can reach the tunnel directly,
    // bypassing browser CSP and Discord URL mapping unreliability.
    if (url.pathname.startsWith('/api/tiermaker/') || url.pathname.startsWith('/ws/')) {
      const target = BACKEND_URL.replace(/\/$/, '');
      const upstream = await fetch(`${target}${url.pathname}${url.search}`, {
        method: request.method,
        headers: request.headers,
        body: request.body ?? undefined,
      });
      return new Response(upstream.body, {
        status: upstream.status,
        headers: upstream.headers,
      });
    }

    // All other requests: serve static SPA assets
    return env.ASSETS.fetch(request);
  },
};
