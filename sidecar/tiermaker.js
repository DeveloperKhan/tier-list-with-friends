/**
 * TierMaker scraping module
 *
 * TierMaker's HTML pages sit behind Cloudflare managed challenge — simple
 * HTTP fetches are blocked. We use playwright-extra + stealth plugin to run a
 * real headless Chromium that passes the challenge automatically.
 *
 * Images at tiermaker.com/images/* are served from a CDN that is NOT behind
 * Cloudflare, so those are proxied with a plain node-fetch call.
 *
 * Scaling design (handles ~50 concurrent searching users on one VM):
 *   - In-memory cache: search results cached 1 h, template items 24 h
 *   - Request coalescing: identical in-flight requests share one Playwright call
 *   - Concurrency limiter: max MAX_CONCURRENT_PAGES pages open at once;
 *     extras queue rather than pile up and OOM the process
 */

import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import sparticuzChromium from '@sparticuz/chromium';
import fetch from 'node-fetch';

chromium.use(StealthPlugin());

const TIERMAKER_BASE = 'https://tiermaker.com';

// ---------------------------------------------------------------------------
// Singleton browser
// ---------------------------------------------------------------------------

let browser = null;

async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    const isProduction = process.platform === 'linux';
    browser = await chromium.launch(
      isProduction
        ? {
            args: sparticuzChromium.args,
            executablePath: await sparticuzChromium.executablePath(),
            headless: true,
          }
        : { headless: true }
    );
  }
  return browser;
}

// ---------------------------------------------------------------------------
// In-memory cache with TTL
// ---------------------------------------------------------------------------

const _cache = new Map(); // key -> { value, expiresAt }

function cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { _cache.delete(key); return null; }
  return entry.value;
}

function cacheSet(key, value, ttlMs) {
  _cache.set(key, { value, expiresAt: Date.now() + ttlMs });
}

// ---------------------------------------------------------------------------
// Request coalescing — prevents duplicate concurrent Playwright calls for the
// same resource (e.g. 5 players searching "pokemon" simultaneously → 1 page)
// ---------------------------------------------------------------------------

const _inflight = new Map(); // key -> Promise

async function dedupe(key, fn) {
  if (_inflight.has(key)) return _inflight.get(key);
  const p = fn().finally(() => _inflight.delete(key));
  _inflight.set(key, p);
  return p;
}

// ---------------------------------------------------------------------------
// Concurrency limiter — caps simultaneous open Playwright pages to avoid OOM.
// Excess requests queue and are served as pages become available.
// Rule of thumb: each open page uses ~80–150 MB; 1 GB VM → MAX 5-6 safely.
// ---------------------------------------------------------------------------

const MAX_CONCURRENT_PAGES = 3;
let _activePage = 0;
const _pageQueue = [];

async function acquirePage() {
  if (_activePage < MAX_CONCURRENT_PAGES) { _activePage++; return; }
  await new Promise(resolve => _pageQueue.push(resolve));
  _activePage++;
}

function releasePage() {
  _activePage = Math.max(0, _activePage - 1);
  _pageQueue.shift()?.();
}

// ---------------------------------------------------------------------------
// Scraping helpers
// ---------------------------------------------------------------------------

async function withPage(fn) {
  await acquirePage();
  const b = await getBrowser();
  const page = await b.newPage();
  try {
    return await fn(page);
  } finally {
    await page.close();
    releasePage();
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Search TierMaker for templates matching `query`.
 * Results are cached for 1 hour — identical concurrent requests share one call.
 *
 * @param {string} query
 * @returns {Promise<Array<{ url, name, thumbnailUrl, imageCount }>>}
 */
export async function searchTemplates(query) {
  const key = `search:${query.toLowerCase().trim()}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  return dedupe(key, async () => {
    const result = await withPage(async (page) => {
      await page.goto(
        `${TIERMAKER_BASE}/search/?q=${encodeURIComponent(query)}`,
        { waitUntil: 'domcontentloaded', timeout: 30_000 },
      );
      await page.waitForTimeout(2000);

      return page.evaluate((base) => {
        return [...document.querySelectorAll('.list-item')].map(item => {
          const link = item.querySelector('a');
          const name = item.querySelector('.cat-header')?.textContent?.trim();
          const carouselEl = item.querySelector('.category-carousel-item');
          const countEl = item.querySelector('.image-count-container');

          const bgStyle = carouselEl?.style?.backgroundImage ?? '';
          const thumbnailUrl = bgStyle.match(/url\(['"]?([^'"]+)['"]?\)/)?.[1] ?? null;

          const href = link?.getAttribute('href');
          const url = href ? `${base}${href}` : null;

          return {
            url,
            name: name ?? null,
            thumbnailUrl,
            imageCount: parseInt(countEl?.textContent?.trim() ?? '0', 10),
          };
        }).filter(r => r.url && r.name);
      }, TIERMAKER_BASE);
    });

    cacheSet(key, result, 60 * 60 * 1000); // 1 hour
    return result;
  });
}

/**
 * Fetch the items from a TierMaker template page.
 * Results are cached for 24 hours — template content rarely changes.
 *
 * @param {string} templateUrl  must be a tiermaker.com/create/* URL
 * @returns {Promise<{ name: string, items: Array<{ id, imageUrl }> }>}
 */
export async function getTemplateItems(templateUrl) {
  const key = `template:${templateUrl}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  return dedupe(key, async () => {
    const result = await withPage(async (page) => {
      await page.goto(templateUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
      await page.waitForTimeout(2000);

      return page.evaluate(() => {
        const rawTitle = document.title ?? '';
        const name = rawTitle
          .replace(/^Create a?\s+/i, '')
          .replace(/\s+Tier\s+List.*$/i, '')
          .trim() || rawTitle;

        const items = [...document.querySelectorAll('.character')].map((el, i) => {
          const img = el.querySelector('img.draggable-filler');
          return { id: el.id || String(i + 1), imageUrl: img?.src ?? null };
        }).filter(item => item.imageUrl);

        return { name, items };
      });
    });

    cacheSet(key, result, 24 * 60 * 60 * 1000); // 24 hours
    return result;
  });
}

/**
 * Proxy a TierMaker CDN image (no Playwright — CDN is not behind Cloudflare).
 * Only accepts URLs starting with https://tiermaker.com/images/.
 */
export async function fetchImage(imageUrl) {
  if (!imageUrl.startsWith('https://tiermaker.com/images/')) {
    throw new Error('Only tiermaker.com/images/* URLs are allowed');
  }

  const res = await fetch(imageUrl, {
    headers: {
      Referer: 'https://tiermaker.com/',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });

  if (!res.ok) throw new Error(`CDN returned ${res.status} for ${imageUrl}`);

  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get('content-type') ?? 'image/png';
  return { buffer, contentType };
}

/** Call on server shutdown to clean up the Chromium process. */
export async function closeBrowser() {
  if (browser) { await browser.close(); browser = null; }
}
