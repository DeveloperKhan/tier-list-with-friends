import { Router } from "express";
import fetch from "node-fetch";

const router = Router();

async function proxyToSidecar(path, res) {
  const SIDECAR_URL = process.env.TIERMAKER_SIDECAR_URL?.replace(/\/$/, "");
  if (!SIDECAR_URL) {
    return res.status(503).json({
      error: "TierMaker sidecar is not configured (TIERMAKER_SIDECAR_URL not set)",
    });
  }
  try {
    const upstream = await fetch(`${SIDECAR_URL}${path}`);
    const contentType = upstream.headers.get("content-type") ?? "application/json";
    const cacheControl = upstream.headers.get("cache-control");
    res.status(upstream.status).set("Content-Type", contentType);
    if (cacheControl) res.set("Cache-Control", cacheControl);
    upstream.body.pipe(res);
  } catch (err) {
    console.error("[sidecar proxy]", err.message);
    res.status(502).json({ error: "Sidecar unreachable" });
  }
}

router.get("/search", (req, res) =>
  proxyToSidecar(`/search?q=${encodeURIComponent(req.query.q ?? "")}`, res)
);

router.get("/template", (req, res) =>
  proxyToSidecar(`/template?url=${encodeURIComponent(req.query.url ?? "")}`, res)
);

router.get("/image", async (req, res) => {
  const imageUrl = req.query.url ?? "";
  if (!imageUrl.startsWith("https://tiermaker.com/images/")) {
    return res.status(400).json({ error: "Only tiermaker.com/images/* URLs are allowed" });
  }
  try {
    const upstream = await fetch(imageUrl, {
      headers: {
        Referer: "https://tiermaker.com/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
    });
    if (!upstream.ok) return res.status(upstream.status).end();
    const contentType = upstream.headers.get("content-type") ?? "image/png";
    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=86400");
    upstream.body.pipe(res);
  } catch (err) {
    console.error("[tiermaker image proxy]", err.message);
    res.status(502).end();
  }
});

export default router;
