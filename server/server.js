import express from "express";
import dotenv from "dotenv";
import fetch from "node-fetch";
import { searchTemplates, getTemplateItems, fetchImage, closeBrowser } from "./tiermaker.js";
dotenv.config({ path: "../.env" });

const app = express();
const port = 3001;

// Allow express to parse JSON bodies
app.use(express.json());

app.post("/api/token", async (req, res) => {
  try {
    // Exchange the code for an access_token
    const response = await fetch(`https://discord.com/api/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: process.env.VITE_DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code: req.body.code,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("[token exchange] Discord error:", data);
      return res.status(response.status).json({ error: data.error_description ?? data.error ?? "Discord token exchange failed" });
    }

    // Return the access_token to our client as { access_token: "..."}
    res.send({ access_token: data.access_token });
  } catch (err) {
    console.error("[token exchange] Unexpected error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// TierMaker API
// ---------------------------------------------------------------------------

/**
 * GET /api/tiermaker/search?q=pokemon
 * Returns a list of matching TierMaker templates.
 * Uses Playwright + stealth to bypass Cloudflare on the HTML pages.
 */
app.get("/api/tiermaker/search", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) return res.status(400).json({ error: "q is required" });

  try {
    const results = await searchTemplates(q);
    res.json(results);
  } catch (err) {
    console.error("[tiermaker search]", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/tiermaker/template?url=https://tiermaker.com/create/...
 * Returns the name and item image URLs for a specific template.
 */
app.get("/api/tiermaker/template", async (req, res) => {
  const url = String(req.query.url ?? "").trim();
  if (!url.startsWith("https://tiermaker.com/")) {
    return res.status(400).json({ error: "url must be a tiermaker.com URL" });
  }

  try {
    const data = await getTemplateItems(url);
    res.json(data);
  } catch (err) {
    console.error("[tiermaker template]", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/tiermaker/image?url=https://tiermaker.com/images/...
 * Proxies a TierMaker CDN image. The CDN does not require Cloudflare bypass.
 * Only tiermaker.com/images/* URLs are accepted.
 */
app.get("/api/tiermaker/image", async (req, res) => {
  const url = String(req.query.url ?? "").trim();
  if (!url.startsWith("https://tiermaker.com/images/")) {
    return res.status(400).json({ error: "url must be a tiermaker.com/images/ URL" });
  }

  try {
    const { buffer, contentType } = await fetchImage(url);
    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=86400"); // cache 24 h
    res.send(buffer);
  } catch (err) {
    console.error("[tiermaker image]", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------

const server = app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});

// Clean up Chromium on graceful shutdown
process.on("SIGTERM", async () => { await closeBrowser(); server.close(); });
process.on("SIGINT",  async () => { await closeBrowser(); server.close(); });
