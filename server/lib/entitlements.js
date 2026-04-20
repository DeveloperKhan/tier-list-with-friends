const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const cache = new Map(); // userId → { isPremium, expiresAt }

export async function hasPremiumEntitlement(userId) {
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.isPremium;

  const appId = process.env.VITE_DISCORD_CLIENT_ID;
  const skuId = process.env.DISCORD_PREMIUM_SKU_ID;
  const botToken = process.env.DISCORD_BOT_TOKEN;

  if (!appId || !skuId || !botToken) return false;

  try {
    const res = await fetch(
      `https://discord.com/api/v10/applications/${appId}/entitlements?user_id=${userId}&sku_id=${skuId}&exclude_ended=true`,
      { headers: { Authorization: `Bot ${botToken}` } }
    );
    if (!res.ok) {
      console.warn(`[entitlements] Discord API ${res.status} for user ${userId}`);
      return false;
    }
    const data = await res.json();
    const isPremium = Array.isArray(data) && data.length > 0;
    cache.set(userId, { isPremium, expiresAt: Date.now() + CACHE_TTL_MS });
    return isPremium;
  } catch (err) {
    console.error("[entitlements] fetch error:", err);
    return false;
  }
}
