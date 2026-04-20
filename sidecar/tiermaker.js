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
let _browserLaunchPromise = null;

async function getBrowser() {
  if (browser?.isConnected()) return browser;
  if (!_browserLaunchPromise) {
    _browserLaunchPromise = (async () => {
      const isLinux = process.platform === 'linux';
      // --single-process is fine for Lambda but kills the whole browser if any
      // page crashes in a persistent server — remove it.
      const launchOptions = isLinux
        ? {
            args: sparticuzChromium.args.filter(a => a !== '--single-process'),
            executablePath: await sparticuzChromium.executablePath(),
            headless: true,
          }
        : { headless: true };
      const b = await chromium.launch(launchOptions);
      browser = b;
      return b;
    })().finally(() => { _browserLaunchPromise = null; });
  }
  return _browserLaunchPromise;
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

// ---------------------------------------------------------------------------
// Network interception helpers for getTemplateItems
// ---------------------------------------------------------------------------

function _resolveImageUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  if (raw.startsWith('http')) return raw;
  if (raw.startsWith('/images/')) return `https://tiermaker.com${raw}`;
  return `https://tiermaker.com/images/${raw}`;
}

function _parseTemplateJson(json) {
  if (!json || typeof json !== 'object') return null;

  // Paths where TierMaker may embed character arrays
  const candidates = [
    json.characters,
    json.items,
    json.template?.characters,
    json.template?.items,
    json.data?.characters,
    json.data?.items,
    json.props?.pageProps?.template?.characters,
    json.props?.pageProps?.characters,
    Array.isArray(json) ? json : null,
  ];

  for (const arr of candidates) {
    if (!Array.isArray(arr) || arr.length === 0) continue;
    const first = arr[0];
    const imgField = ['image', 'imageUrl', 'img', 'src', 'background', 'pic']
      .find(f => first[f]);
    if (!imgField) continue;

    const name =
      json.title ?? json.name ??
      json.template?.title ?? json.template?.name ?? '';

    return {
      name,
      items: arr.map((item, i) => ({
        id: String(item.id ?? item.charId ?? i + 1),
        imageUrl: _resolveImageUrl(item[imgField]),
      })).filter(it => it.imageUrl),
    };
  }
  return null;
}

async function _scrapeTemplateFromNetwork(page, templateUrl) {
  const jsonResponses = [];

  const onResponse = async (response) => {
    if (response.status() < 200 || response.status() >= 300) return;
    if (!(response.headers()['content-type'] ?? '').includes('json')) return;
    try {
      jsonResponses.push(await response.json());
    } catch { /* ignore */ }
  };

  page.on('response', onResponse);
  try {
    await page.goto(templateUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    // Give XHR/fetch calls that fire after DOM load time to complete
    await page.waitForTimeout(2_000);
  } finally {
    page.off('response', onResponse);
  }

  // Also check window-level embedded data (Next.js __NEXT_DATA__, etc.)
  const windowData = await page.evaluate(() => {
    if (window.__NEXT_DATA__) return window.__NEXT_DATA__;
    for (const s of document.querySelectorAll('script[type="application/json"]')) {
      try { return JSON.parse(s.textContent); } catch {}
    }
    return null;
  }).catch(() => null);

  if (windowData) jsonResponses.unshift(windowData);

  for (const body of jsonResponses) {
    const parsed = _parseTemplateJson(body);
    if (parsed) return parsed;
  }
  return null; // caller falls back to DOM scraping
}

/**
 * Fetch the items from a TierMaker template page.
 * First tries to intercept the JSON API call TierMaker makes internally
 * (fast — no need to render the full DOM). Falls back to DOM scraping if
 * no matching JSON is found.
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
      // Fast path: intercept TierMaker's own API/XHR calls
      const networkResult = await _scrapeTemplateFromNetwork(page, templateUrl);
      if (networkResult) return networkResult;

      // Slow path: page is already loaded — scrape the rendered DOM
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
