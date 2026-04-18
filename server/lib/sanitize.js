import { randomUUID } from "crypto";
import { MAX_IMAGE_BYTES } from "./constants.js";

export function sanitizeTier(raw) {
  return {
    id: String(raw.id ?? randomUUID()).slice(0, 36),
    label: String(raw.label ?? "").slice(0, 50),
    color: /^#[0-9a-fA-F]{6}$/.test(raw.color) ? raw.color : "#888888",
    itemIds: [],
  };
}

// Returns { item, dataUrl } on success, or null if the raw input is invalid.
// dataUrl is separated from the item so it can be stored in images.js instead
// of being broadcast in STATE_UPDATE. For non-upload kinds, dataUrl is null.
export function sanitizeItem(raw, uploadedBy) {
  const id = String(raw.id ?? randomUUID()).slice(0, 36);

  if (raw.kind === "upload") {
    if (typeof raw.dataUrl !== "string") return null;
    if (!raw.dataUrl.startsWith("data:image/")) return null;
    if (raw.dataUrl.length > MAX_IMAGE_BYTES) return null;
    return {
      item: {
        id,
        kind: "upload",
        imageUrl: "",
        text: "",
        fileName: String(raw.fileName ?? "image").slice(0, 255),
        uploadedBy,
        lockedBy: null,
        ownedBy: null,
      },
      dataUrl: raw.dataUrl,
    };
  }

  if (raw.kind === "tiermaker") {
    if (typeof raw.imageUrl !== "string") return null;
    const imgUrl = raw.imageUrl;
    if (
      !imgUrl.startsWith("https://tiermaker.com/images/") &&
      !imgUrl.startsWith("/images/")
    )
      return null;
    return {
      item: {
        id,
        kind: "tiermaker",
        imageUrl: String(raw.imageUrl).slice(0, 512),
        text: "",
        fileName: String(raw.fileName ?? "image").slice(0, 255),
        uploadedBy,
        lockedBy: null,
        ownedBy: null,
      },
      dataUrl: null,
    };
  }

  if (raw.kind === "text") {
    if (typeof raw.text !== "string" || !raw.text.trim()) return null;
    return {
      item: {
        id,
        kind: "text",
        imageUrl: "",
        text: String(raw.text).slice(0, 200),
        fileName: String(raw.fileName ?? "text").slice(0, 255),
        uploadedBy,
        lockedBy: null,
        ownedBy: null,
      },
      dataUrl: null,
    };
  }

  return null;
}
