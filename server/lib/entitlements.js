const CACHE_TTL_MS = 5 * 60 * 1000;   // 5 minutes on success
const RETRY_TTL_MS = 30 * 1000;        // 30 seconds after any API error

const cache = new Map();     // userId → { isPremium, expiresAt }
const inflight = new Map();  // userId → Promise<boolean>

// Serialise all bot-token requests through a single queue so we never fire
// more than one at a time against the shared bot rate limit bucket.
let queueHead = Promise.resolve();

export function clearEntitlementCache(userId) {
  cache.delete(userId);
}

/**
 * Check entitlements using the user's own OAuth bearer token.
 * Rate-limited per-user, not against the shared bot token bucket.
 * Returns null if the endpoint is unavailable or the token is invalid.
 */
export async function checkEntitlementWithBearer(userId, accessToken) {
  if (!accessToken || accessToken === 'mock-token') return null;

  const appId = process.env.VITE_DISCORD_CLIENT_ID;
  const skuId = process.env.DISCORD_PREMIUM_SKU_ID;
  if (!appId || !skuId) return null;

  try {
    const res = await fetch(
      `https://discord.com/api/v10/users/@me/applications/${appId}/entitlements`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) {
      console.warn(`[entitlements] bearer check ${res.status} for user ${userId}`);
      return null;
    }
    const data = await res.json();
    const isPremium = Array.isArray(data) && data.some(e => e.sku_id === skuId && !e.ended_at);
    cache.set(userId, { isPremium, expiresAt: Date.now() + CACHE_TTL_MS });
    return isPremium;
  } catch (err) {
    console.error("[entitlements] bearer fetch error:", err);
    return null;
  }
}

/**
 * Fallback: check entitlements using the bot token.
 * Only used when no bearer token is available (e.g. CLAIM_PREMIUM event).
 */
export function hasPremiumEntitlement(userId) {
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.isPremium);

  if (inflight.has(userId)) return inflight.get(userId);

  const promise = queueHead.then(() => _fetchWithBotToken(userId));
  queueHead = promise.catch(() => {});
  inflight.set(userId, promise);
  promise.finally(() => inflight.delete(userId));
  return promise;
}

async function _fetchWithBotToken(userId) {
  const appId = process.env.VITE_DISCORD_CLIENT_ID;
  const skuId = process.env.DISCORD_PREMIUM_SKU_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;

  if (!appId || !skuId || !botToken) return false;

  try {
    const res = await fetch(
      `https://discord.com/api/v10/applications/${appId}/entitlements?user_id=${userId}&sku_id=${skuId}&exclude_ended=true`,
      { headers: { Authorization: `Bot ${botToken}` } }
    );

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('retry-after') ?? 1) * 1000;
      console.warn(`[entitlements] 429 for user ${userId}, retry-after=${retryAfter}ms`);
      cache.set(userId, { isPremium: false, expiresAt: Date.now() + Math.max(retryAfter, RETRY_TTL_MS) });
      return false;
    }
    if (!res.ok) {
      console.warn(`[entitlements] bot API ${res.status} for user ${userId}`);
      cache.set(userId, { isPremium: false, expiresAt: Date.now() + RETRY_TTL_MS });
      return false;
    }

    const data = await res.json();
    const isPremium = Array.isArray(data) && data.length > 0;
    cache.set(userId, { isPremium, expiresAt: Date.now() + CACHE_TTL_MS });
    return isPremium;
  } catch (err) {
    console.error("[entitlements] bot fetch error:", err);
    return false;
  }
}
