import { randomUUID } from "crypto";
import { getRoom, setRoom, getSocketInfo } from "../store.js";
import { sanitizeTier } from "../lib/sanitize.js";
import { TIER_PALETTE } from "../lib/constants.js";

export function registerTierHandlers(io, socket) {
  // ── EDIT_TIER (host only) ─────────────────────────────────────────────────
  socket.on("EDIT_TIER", async ({ action, tierId, label, color, newIndex }) => {
    const info = await getSocketInfo(socket.id);
    if (!info) return;
    const room = await getRoom(info.instanceId);
    if (!room || room.hostId !== info.userId || room.phase !== "PLAYING") return;

    if (action === "add") {
      room.tiers.push({
        id: randomUUID(),
        label: "New",
        color: TIER_PALETTE[room.tiers.length % TIER_PALETTE.length],
        itemIds: [],
      });
    } else if (action === "delete") {
      const idx = room.tiers.findIndex((t) => t.id === tierId);
      if (idx === -1) return;
      const [removed] = room.tiers.splice(idx, 1);
      for (const id of removed.itemIds) {
        room.bankItemIds.push(id);
        if (room.items[id]) room.items[id].ownedBy = null;
      }
    } else if (action === "rename") {
      const tier = room.tiers.find((t) => t.id === tierId);
      if (tier && typeof label === "string") tier.label = label.slice(0, 50);
    } else if (action === "recolor") {
      const tier = room.tiers.find((t) => t.id === tierId);
      if (tier && /^#[0-9a-fA-F]{6}$/.test(color)) tier.color = color;
    } else if (action === "reorder") {
      const fromIdx = room.tiers.findIndex((t) => t.id === tierId);
      if (fromIdx === -1 || typeof newIndex !== "number") return;
      const clamped = Math.max(0, Math.min(newIndex, room.tiers.length - 1));
      const [tier] = room.tiers.splice(fromIdx, 1);
      room.tiers.splice(clamped, 0, tier);
    }

    await setRoom(info.instanceId, room);
    io.to(info.instanceId).emit("STATE_UPDATE", room);
  });

  // ── SET_TIERS (host only) — batch save from edit-tiers modal ─────────────
  socket.on("SET_TIERS", async ({ tiers: incoming }) => {
    const info = await getSocketInfo(socket.id);
    if (!info) return;
    const room = await getRoom(info.instanceId);
    if (!room || room.hostId !== info.userId || room.phase !== "PLAYING") return;
    if (!Array.isArray(incoming)) return;

    const existingItemIds = new Map(room.tiers.map((t) => [t.id, t.itemIds]));

    const newTierIds = new Set(incoming.map((t) => String(t.id)));
    for (const tier of room.tiers) {
      if (!newTierIds.has(tier.id)) {
        for (const id of tier.itemIds) {
          room.bankItemIds.push(id);
          if (room.items[id]) room.items[id].ownedBy = null;
        }
      }
    }

    room.tiers = incoming.slice(0, 20).map((t) => ({
      ...sanitizeTier(t),
      itemIds: existingItemIds.get(String(t.id)) ?? [],
    }));

    await setRoom(info.instanceId, room);
    io.to(info.instanceId).emit("STATE_UPDATE", room);
    console.log(`[room:${info.instanceId}] tiers updated by host (${room.tiers.length} tiers)`);
  });
}
