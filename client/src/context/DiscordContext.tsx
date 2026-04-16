import { DiscordSDK, DiscordSDKMock, type IDiscordSDK } from '@discord/embedded-app-sdk';
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

const clientId = import.meta.env.VITE_DISCORD_CLIENT_ID as string;

/**
 * Discord injects a `frame_id` query param when loading the activity inside
 * its iframe. Its absence means we are running in a plain browser (local dev).
 */
export const isInsideDiscord = new URLSearchParams(window.location.search).has('frame_id');

/**
 * Build the SDK singleton. In local dev we use DiscordSDKMock, which
 * implements the same IDiscordSDK interface without requiring a Discord iframe.
 *
 * Mock IDs are persisted in sessionStorage so they stay stable across HMR
 * reloads but reset each browser session (simulating a fresh join).
 */
function buildSdk(): IDiscordSDK {
  if (isInsideDiscord) {
    return new DiscordSDK(clientId);
  }

  const STORAGE_KEY = 'dev_mock_ids';
  const stored = sessionStorage.getItem(STORAGE_KEY);
  const ids: { guildId: string; channelId: string; locationId: string } = stored
    ? JSON.parse(stored)
    : {
        guildId: String(Math.floor(Math.random() * 1e15)),
        channelId: String(Math.floor(Math.random() * 1e15)),
        locationId: String(Math.floor(Math.random() * 1e15)),
      };

  if (!stored) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ids));

  return new DiscordSDKMock(clientId, ids.guildId, ids.channelId, ids.locationId);
}

// Single SDK instance — never re-instantiate; the SDK is a singleton.
const discordSdk = buildSdk();

// ---------------------------------------------------------------------------
// Auth state
// ---------------------------------------------------------------------------

export type AuthUser = {
  id: string;
  username: string;
  avatar: string | null;
  global_name: string | null;
};

export type AuthState =
  | { status: 'loading' }
  | { status: 'error'; error: string }
  | {
      status: 'ready';
      discordSdk: IDiscordSDK;
      accessToken: string;
      user: AuthUser;
    };

const DiscordContext = createContext<AuthState>({ status: 'loading' });

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function DiscordProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' });
  // Guard against double-invocation in React StrictMode
  const settingUp = useRef(false);

  useEffect(() => {
    if (settingUp.current) return;
    settingUp.current = true;

    async function setup() {
      try {
        await discordSdk.ready();

        if (!isInsideDiscord) {
          /**
           * LOCAL DEV (mock) path
           * Skip the real OAuth flow — the mock SDK's authenticate command
           * returns sensible fake data without needing a Discord token exchange.
           */
          const auth = await discordSdk.commands.authenticate({
            access_token: 'mock-token',
          });

          setAuth({
            status: 'ready',
            discordSdk,
            accessToken: 'mock-token',
            user: {
              id: auth.user.id,
              username: auth.user.username,
              avatar: auth.user.avatar ?? null,
              global_name: auth.user.global_name ?? 'Dev User',
            },
          });
          return;
        }

        /**
         * DISCORD path
         * Full OAuth flow: authorize → server token exchange → authenticate.
         */
        const { code } = await discordSdk.commands.authorize({
          client_id: clientId,
          response_type: 'code',
          state: '',
          prompt: 'none',
          scope: ['identify', 'guilds', 'guilds.members.read'],
        });

        // The server exchanges the code for an access_token using the
        // DISCORD_CLIENT_SECRET — that secret must never touch the browser.
        const tokenRes = await fetch('/api/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        });

        if (!tokenRes.ok) {
          const body = await tokenRes.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? `Token exchange failed (HTTP ${tokenRes.status})`);
        }
        const { access_token } = (await tokenRes.json()) as {
          access_token: string;
        };

        const auth = await discordSdk.commands.authenticate({ access_token });

        // Patch fetch after auth so /api/tiermaker/* and /ws/* requests get the
        // /.proxy/ prefix Discord's proxy layer requires for URL mapping routing.
        // Only these prefixes are patched — /api/token is left untouched.
        const _nativeFetch = window.fetch.bind(window);
        window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
          const url = typeof input === 'string' ? input
            : input instanceof URL ? input.toString()
            : (input as Request).url;
          const needsProxy = (url.startsWith('/api/') && url !== '/api/token') || url.startsWith('/ws');
          if (needsProxy) {
            const proxied = `/.proxy${url}`;
            return _nativeFetch(typeof input === 'string' ? proxied : new URL(proxied, window.location.href), init);
          }
          return _nativeFetch(input as RequestInfo, init);
        };

        setAuth({
          status: 'ready',
          discordSdk,
          accessToken: access_token,
          user: {
            id: auth.user.id,
            username: auth.user.username,
            avatar: auth.user.avatar ?? null,
            global_name: auth.user.global_name ?? null,
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setAuth({ status: 'error', error: message });
      }
    }

    setup();
  }, []);

  return (
    <DiscordContext.Provider value={auth}>{children}</DiscordContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Access Discord auth state anywhere in the tree.
 * Check `auth.status === 'ready'` before using `auth.discordSdk`.
 *
 * Works in both Discord (real SDK) and local dev (DiscordSDKMock).
 */
export function useDiscord() {
  return useContext(DiscordContext);
}
