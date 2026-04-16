interface Env {
  ASSETS: Fetcher;
  VITE_DISCORD_CLIENT_ID: string;
  DISCORD_CLIENT_SECRET: string;
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

    // All other requests: serve static SPA assets
    return env.ASSETS.fetch(request);
  },
};
