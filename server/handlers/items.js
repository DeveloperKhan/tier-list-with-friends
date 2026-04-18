import { randomUUID } from "crypto";
import { getRoom, setRoom, getSocketInfo } from "../store.js";
import { put as putImage } from "../images.js";
import { sanitizeItem } from "../lib/sanitize.js";
import { MAX_ITEMS, MAX_IMAGE_BYTES } from "../lib/constants.js";

export function registerItemHandlers(io, socket) {
  // ── LOCK_ITEM ─────────────────────────────────────────────────────────────
  socket.on("LOCK_ITEM", async ({ itemId }) => {
    const info = await getSocketInfo(socket.id);
    if (!info) return;
    const room = await getRoom(info.instanceId);
    if (!room || room.phase !== "PLAYING") return;

    const item = room.items[itemId];
    if (!item) return;

    if (
      (item.lockedBy !== null && item.lockedBy !== info.userId) ||
      (item.ownedBy !== null && item.ownedBy !== info.userId)
    ) {
      socket.emit("LOCK_REJECTED", { itemId, lockedBy: item.lockedBy ?? item.ownedBy });
      return;
    }

    item.lockedBy = info.userId;
    await setRoom(info.instanceId, room);
    io.to(info.instanceId).emit("STATE_UPDATE", room);
  });

  // ── UNLOCK_ITEM ───────────────────────────────────────────────────────────
  socket.on("UNLOCK_ITEM", async ({ itemId }) => {
    const info = await getSocketInfo(socket.id);
    if (!info) return;
    const room = await getRoom(info.instanceId);
    if (!room) return;

    const item = room.items[itemId];
    if (!item) return;

    if (item.lockedBy === info.userId) item.lockedBy = null;
    await setRoom(info.instanceId, room);
    io.to(info.instanceId).emit("STATE_UPDATE", room);
  });

  // ── MOVE_ITEM ─────────────────────────────────────────────────────────────
  socket.on("MOVE_ITEM", async ({ itemId, destination }) => {
    const info = await getSocketInfo(socket.id);
    if (!info) return;
    const room = await getRoom(info.instanceId);
    if (!room || room.phase !== "PLAYING") return;

    const item = room.items[itemId];
    if (!item || item.lockedBy !== info.userId) return;

    room.bankItemIds = room.bankItemIds.filter((id) => id !== itemId);
    for (const tier of room.tiers) {
      tier.itemIds = tier.itemIds.filter((id) => id !== itemId);
    }

    if (destination?.type === "tier") {
      const tier = room.tiers.find((t) => t.id === destination.tierId);
      if (!tier) {
        room.bankItemIds.push(itemId);
        item.ownedBy = null;
      } else {
        const idx =
          typeof destination.index === "number"
            ? Math.min(destination.index, tier.itemIds.length)
            : tier.itemIds.length;
        tier.itemIds.splice(idx, 0, itemId);
        item.ownedBy = info.userId;
      }
    } else {
      room.bankItemIds.push(itemId);
      item.ownedBy = null;
    }

    item.lockedBy = null;
    await setRoom(info.instanceId, room);
    io.to(info.instanceId).emit("STATE_UPDATE", room);
  });

  // ── UPLOAD_IMAGE (any player, PLAYING phase) ──────────────────────────────
  socket.on("UPLOAD_IMAGE", async ({ dataUrl, fileName }) => {
    const info = await getSocketInfo(socket.id);
    if (!info) return;
    const room = await getRoom(info.instanceId);
    if (!room || room.phase !== "PLAYING") return;

    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
      socket.emit("UPLOAD_REJECTED", { reason: "Invalid image format." });
      return;
    }
    if (dataUrl.length > MAX_IMAGE_BYTES) {
      socket.emit("UPLOAD_REJECTED", { reason: "Image too large (max ~150 KB)." });
      return;
    }
    if (Object.keys(room.items).length >= MAX_ITEMS) {
      socket.emit("UPLOAD_REJECTED", { reason: `Room is at the ${MAX_ITEMS}-item limit.` });
      return;
    }

    const id = randomUUID();
    await putImage(id, dataUrl);

    room.items[id] = {
      id,
      kind: "upload",
      imageUrl: "",
      text: "",
      fileName: String(fileName ?? "image").slice(0, 255),
      uploadedBy: info.userId,
      lockedBy: null,
      ownedBy: null,
    };
    room.bankItemIds.push(id);
    await setRoom(info.instanceId, room);
    io.to(info.instanceId).emit("STATE_UPDATE", room);
  });

  // ── ADD_TEXT_ITEM (any player, PLAYING phase) ─────────────────────────────
  socket.on("ADD_TEXT_ITEM", async ({ text }) => {
    const info = await getSocketInfo(socket.id);
    if (!info) return;
    const room = await getRoom(info.instanceId);
    if (!room || room.phase !== "PLAYING") return;

    if (typeof text !== "string" || !text.trim()) return;
    if (Object.keys(room.items).length >= MAX_ITEMS) {
      socket.emit("UPLOAD_REJECTED", { reason: `Room is at the ${MAX_ITEMS}-item limit.` });
      return;
    }

    const label = String(text).trim().slice(0, 200);
    const id = randomUUID();
    room.items[id] = {
      id,
      kind: "text",
      imageUrl: "",
      text: label,
      fileName: label,
      uploadedBy: info.userId,
      lockedBy: null,
      ownedBy: null,
    };
    room.bankItemIds.push(id);
    await setRoom(info.instanceId, room);
    io.to(info.instanceId).emit("STATE_UPDATE", room);
  });

  // ── LOAD_TEMPLATE (any player, PLAYING phase) ─────────────────────────────
  socket.on("LOAD_TEMPLATE", async ({ items: incoming }) => {
    const info = await getSocketInfo(socket.id);
    if (!info) return;
    const room = await getRoom(info.instanceId);
    if (!room || room.phase !== "PLAYING") return;
    if (!Array.isArray(incoming)) return;

    const total = incoming.length;
    let loaded = 0;
    const imageWrites = [];

    for (const rawItem of incoming) {
      if (Object.keys(room.items).length >= MAX_ITEMS) break;

      const result = sanitizeItem({ ...rawItem, id: randomUUID() }, info.userId);
      if (!result) continue;

      room.items[result.item.id] = result.item;
      room.bankItemIds.push(result.item.id);
      if (result.dataUrl) imageWrites.push(putImage(result.item.id, result.dataUrl));
      loaded++;
    }

    await Promise.all(imageWrites);

    if (loaded < total) {
      socket.emit("LOAD_TEMPLATE_PARTIAL", {
        loaded,
        total,
        reason: `Only ${loaded} of ${total} images fit within the ${MAX_ITEMS}-item limit.`,
      });
    }

    await setRoom(info.instanceId, room);
    io.to(info.instanceId).emit("STATE_UPDATE", room);
  });
}
