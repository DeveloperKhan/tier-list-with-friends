import express from "express";
import { searchTemplates, getTemplateItems, fetchImage, closeBrowser } from "./tiermaker.js";

const app = express();
const port = process.env.PORT ?? 3002;

app.get("/health", (_req, res) => res.sendStatus(200));

app.get("/search", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  if (!q) return res.status(400).json({ error: "q is required" });

  try {
    const results = await searchTemplates(q);
    res.json(results);
  } catch (err) {
    console.error("[search]", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/template", async (req, res) => {
  const url = String(req.query.url ?? "").trim();
  if (!url.startsWith("https://tiermaker.com/")) {
    return res.status(400).json({ error: "url must be a tiermaker.com URL" });
  }

  try {
    const data = await getTemplateItems(url);
    res.json(data);
  } catch (err) {
    console.error("[template]", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get("/image", async (req, res) => {
  const url = String(req.query.url ?? "").trim();
  if (!url.startsWith("https://tiermaker.com/images/")) {
    return res.status(400).json({ error: "url must be a tiermaker.com/images/ URL" });
  }

  try {
    const { buffer, contentType } = await fetchImage(url);
    res.set("Content-Type", contentType);
    res.set("Cache-Control", "public, max-age=86400");
    res.send(buffer);
  } catch (err) {
    console.error("[image]", err.message);
    res.status(500).json({ error: err.message });
  }
});

const server = app.listen(port, () => {
  console.log(`Sidecar listening at http://localhost:${port}`);
});

process.on("SIGTERM", async () => { await closeBrowser(); server.close(); });
process.on("SIGINT",  async () => { await closeBrowser(); server.close(); });
