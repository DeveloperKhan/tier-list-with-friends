/**
 * TierMaker scraping module
 *
 * TierMaker's HTML pages sit behind Cloudflare managed challenge — simple
 * HTTP fetches are blocked. We use playwright-extra + stealth plugin to run a
 * real headless Chromium that passes the challenge automatically.
 *
 * Images at tiermaker.com/images/* are served from a CDN that is NOT behind
 * Cloudflare, so those are proxied with a plain node-fetch call.
 */

import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import sparticuzChromium from '@sparticuz/chromium';
import fetch from 'node-fetch';

chromium.use(StealthPlugin());

const TIERMAKER_BASE = 'https://tiermaker.com';

// Singleton browser — reused across requests to avoid cold-start on every request.
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

/**
 * Search TierMaker for templates matching `query`.
 * Returns up to 40 results (one page of search results).
 *
 * @param {string} query
 * @returns {Promise<Array<{ url: string, name: string, thumbnailUrl: string, imageCount: number }>>}
 */
export async function searchTemplates(query) {
  const b = await getBrowser();
  const page = await b.newPage();

  try {
    await page.goto(
      `${TIERMAKER_BASE}/search/?q=${encodeURIComponent(query)}`,
      { waitUntil: 'domcontentloaded', timeout: 30_000 },
    );
    // Give the page a moment to finish rendering any deferred content
    await page.waitForTimeout(2000);

    return await page.evaluate((base) => {
      // Each search result card is a .list-item
      return [...document.querySelectorAll('.list-item')].map(item => {
        const link = item.querySelector('a');
        const name = item.querySelector('.cat-header')?.textContent?.trim();
        const carouselEl = item.querySelector('.category-carousel-item');
        const countEl = item.querySelector('.image-count-container');

        // The thumbnail is stored as a CSS background-image
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
  } finally {
    await page.close();
  }
}

/**
 * Fetch the items from a TierMaker template page.
 * `templateUrl` must be a tiermaker.com/create/* URL returned by searchTemplates.
 *
 * @param {string} templateUrl
 * @returns {Promise<{ name: string, items: Array<{ id: string, imageUrl: string }> }>}
 */
export async function getTemplateItems(templateUrl) {
  const b = await getBrowser();
  const page = await b.newPage();

  try {
    await page.goto(templateUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await page.waitForTimeout(2000);

    return await page.evaluate(() => {
      // Template name is in the page <title>.
      // Strip common TierMaker title boilerplate like:
      //   "Create a Pokemon Unite Tier List - TierMaker"  →  "Pokemon Unite"
      const rawTitle = document.title ?? '';
      const name = rawTitle
        .replace(/^Create a?\s+/i, '')
        .replace(/\s+Tier\s+List.*$/i, '')
        .trim() || rawTitle;

      // Each draggable item is a .character div with an img.draggable-filler inside
      const items = [...document.querySelectorAll('.character')].map((el, i) => {
        const img = el.querySelector('img.draggable-filler');
        return {
          // The element's id is TierMaker's internal image ID (e.g. "1", "12")
          id: el.id || String(i + 1),
          imageUrl: img?.src ?? null,
        };
      }).filter(item => item.imageUrl);

      return { name, items };
    });
  } finally {
    await page.close();
  }
}

/**
 * Proxy a TierMaker CDN image.
 * Only accepts URLs that start with https://tiermaker.com/images/ to prevent
 * this endpoint from being used as an open proxy.
 *
 * Returns { buffer: Buffer, contentType: string }
 */
export async function fetchImage(imageUrl) {
  if (!imageUrl.startsWith('https://tiermaker.com/images/')) {
    throw new Error('Only tiermaker.com/images/* URLs are allowed');
  }

  const res = await fetch(imageUrl, {
    headers: {
      Referer: 'https://tiermaker.com/',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    },
  });

  if (!res.ok) {
    throw new Error(`CDN returned ${res.status} for ${imageUrl}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get('content-type') ?? 'image/png';
  return { buffer, contentType };
}

/** Call this on server shutdown to clean up the Chromium process. */
export async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
  }
}
