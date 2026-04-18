import { randomUUID } from "crypto";
import express, { Router } from "express";
import { get, put } from "../images.js";

const router = Router();

// Dev-only upload handler — mirrors what the Worker does in production via R2.
// Receives a raw image binary, stores it in the in-memory images.js store,
// and returns { imageId } so the client flow is identical in both environments.
router.post("/upload", express.raw({ type: "image/*", limit: "100kb" }), async (req, res) => {
  const contentType = req.headers["content-type"] ?? "image/webp";
  if (!contentType.startsWith("image/")) {
    return res.status(400).json({ error: "Only image/* content types accepted." });
  }
  const body = req.body;
  if (!Buffer.isBuffer(body) || body.length === 0) {
    return res.status(400).json({ error: "Empty body." });
  }

  const imageId = randomUUID();
  const dataUrl = `data:${contentType};base64,${body.toString("base64")}`;
  await put(imageId, dataUrl);
  res.json({ imageId });
});

// Serves uploaded images by item ID.
router.get("/:id", async (req, res) => {
  const dataUrl = await get(req.params.id);
  if (!dataUrl) return res.status(404).end();

  // Parse the data URI: data:<mime>;base64,<data>
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/s);
  if (!match) return res.status(500).end();

  const [, mime, b64] = match;
  const buf = Buffer.from(b64, "base64");
  res.set("Content-Type", mime);
  res.set("Cache-Control", "private, max-age=3600");
  res.send(buf);
});

export default router;
