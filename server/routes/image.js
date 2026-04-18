import { Router } from "express";
import { get } from "../images.js";

// Serves uploaded images by item ID.
// Swap images.js for R2/S3 and this route requires no changes.
const router = Router();

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
