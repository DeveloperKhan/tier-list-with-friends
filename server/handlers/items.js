import { randomUUID } from "crypto";
import { getRoom, setRoom, getSocketInfo } from "../store.js";
import { sanitizeItem } from "../lib/sanitize.js";
import { MAX_ITEMS, MAX_ITEMS_PREMIUM } from "../lib/constants.js";

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
    // Send only the changed lock field — not the full room state.
    io.to(info.instanceId).emit("ITEM_LOCK_CHANGED", { itemId, lockedBy: info.userId });
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
    // Send only the changed lock field — not the full room state.
    io.to(info.instanceId).emit("ITEM_LOCK_CHANGED", { itemId, lockedBy: null });
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

    let placedTierId = null;
    let placedIndex = null;

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
        placedTierId = tier.id;
        placedIndex = idx;

        // Auto-upvote by the placer (score starts at +1)
        if (!room.votes) room.votes = {};
        if (!room.votes[itemId]) room.votes[itemId] = { up: [], down: [] };
        const iv = room.votes[itemId];
        const downIdx = iv.down.indexOf(info.userId);
        if (downIdx !== -1) iv.down.splice(downIdx, 1);
        if (!iv.up.includes(info.userId)) iv.up.push(info.userId);
      }
    } else {
      const idx =
        typeof destination?.index === "number"
          ? Math.min(destination.index, room.bankItemIds.length)
          : room.bankItemIds.length;
      room.bankItemIds.splice(idx, 0, itemId);
      item.ownedBy = null;
      placedIndex = idx;
      // Clear votes when item returns to bank
      if (room.votes?.[itemId]) delete room.votes[itemId];
    }

    item.lockedBy = null;
    await setRoom(info.instanceId, room);
    io.to(info.instanceId).emit("ITEM_MOVED", {
      itemId,
      tierId: placedTierId,
      index: placedIndex,
      ownedBy: item.ownedBy,
    });
    // Broadcast the auto-upvote so all clients reflect the new score
    if (placedTierId !== null && room.votes?.[itemId]) {
      io.to(info.instanceId).emit("VOTE_CHANGED", { itemId, votes: room.votes[itemId] });
    }
  });

  // ── UPLOAD_IMAGE (any player, PLAYING phase) ──────────────────────────────
  socket.on("UPLOAD_IMAGE", async ({ imageId, fileName }) => {
    const info = await getSocketInfo(socket.id);
    if (!info) return;
    const room = await getRoom(info.instanceId);
    if (!room || room.phase !== "PLAYING") return;

    if (typeof imageId !== "string" || !/^[0-9a-f-]{36}$/i.test(imageId)) {
      socket.emit("UPLOAD_REJECTED", { reason: "Invalid image ID." });
      return;
    }
    const itemLimit = room.isPremium ? MAX_ITEMS_PREMIUM : MAX_ITEMS;
    if (Object.keys(room.items).length >= itemLimit) {
      socket.emit("UPLOAD_REJECTED", { reason: `Room is at the ${itemLimit}-item limit.` });
      return;
    }

    room.items[imageId] = {
      id: imageId,
      kind: "upload",
      imageUrl: "",
      text: "",
      fileName: String(fileName ?? "image").slice(0, 255),
      uploadedBy: info.userId,
      lockedBy: null,
      ownedBy: null,
    };
    room.bankItemIds.push(imageId);
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
    const itemLimit = room.isPremium ? MAX_ITEMS_PREMIUM : MAX_ITEMS;
    if (Object.keys(room.items).length >= itemLimit) {
      socket.emit("UPLOAD_REJECTED", { reason: `Room is at the ${itemLimit}-item limit.` });
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

    const itemLimit = room.isPremium ? MAX_ITEMS_PREMIUM : MAX_ITEMS;
    const total = incoming.length;
    let loaded = 0;

    for (const rawItem of incoming) {
      if (Object.keys(room.items).length >= itemLimit) break;

      const result = sanitizeItem({ ...rawItem, id: randomUUID() }, info.userId);
      if (!result) continue;

      room.items[result.item.id] = result.item;
      room.bankItemIds.push(result.item.id);
      loaded++;
    }

    if (loaded < total) {
      socket.emit("LOAD_TEMPLATE_PARTIAL", {
        loaded,
        total,
        reason: `Only ${loaded} of ${total} images fit within the ${itemLimit}-item limit.`,
      });
    }

    await setRoom(info.instanceId, room);
    io.to(info.instanceId).emit("STATE_UPDATE", room);
  });
}
