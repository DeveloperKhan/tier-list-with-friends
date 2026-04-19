import {
  getRoom, setRoom, deleteRoom,
  getRoomSockets, deleteRoomSockets,
  getSocketInfo, deleteSocketInfo,
  getPendingDisconnect, setPendingDisconnect, deletePendingDisconnect,
  getRoomTimer, deleteRoomTimer,
  getReconcileTimer, deleteReconcileTimer,
} from "../store.js";
import { del as delImage } from "../images.js";
import { GRACE_MS } from "../lib/constants.js";

export function registerDisconnectHandler(io, socket) {
  socket.on("disconnect", async () => {
    console.log("[socket] disconnected:", socket.id);
    const info = await getSocketInfo(socket.id);
    if (!info) return;

    await deleteSocketInfo(socket.id);

    const { instanceId, userId } = info;
    const sockets = await getRoomSockets(instanceId);
    if (!sockets) return;

    sockets.delete(socket.id);

    const room = await getRoom(instanceId);
    if (!room) return;

    const userStillConnected = [...sockets.values()].some((uid) => uid === userId);
    if (userStillConnected) return;

    socket.to(instanceId).emit("CURSOR_REMOVE", { userId });

    // Release any active drag lock immediately so other players aren't blocked
    // for the entire grace period. Owned placements stay in place.
    const movedItems = [];
    for (const item of Object.values(room.items)) {
      if (item.lockedBy === userId) {
        item.lockedBy = null;
        item.ownedBy = null;
        for (const tier of room.tiers) {
          tier.itemIds = tier.itemIds.filter((id) => id !== item.id);
        }
        if (!room.bankItemIds.includes(item.id)) {
          room.bankItemIds.push(item.id);
        }
        movedItems.push({ itemId: item.id, index: room.bankItemIds.indexOf(item.id) });
      }
    }
    if (movedItems.length > 0) {
      await setRoom(instanceId, room);
      // Use targeted events instead of full STATE_UPDATE to save bandwidth.
      for (const { itemId, index } of movedItems) {
        io.to(instanceId).emit("ITEM_MOVED", { itemId, tierId: null, index, ownedBy: null });
      }
    }

    // Grace period: give the user 30 s to reconnect before evicting.
    const graceKey = `${instanceId}:${userId}`;
    console.log(`[room:${instanceId}] ${userId} disconnected — grace period started (${GRACE_MS / 1000}s)`);

    const timer = setTimeout(async () => {
      deletePendingDisconnect(graceKey);

      const r = await getRoom(instanceId);
      if (!r || !r.participants[userId]) return;

      // Release owned items and clean up upload images for this user.
      for (const item of Object.values(r.items)) {
        if (item.ownedBy === userId) item.ownedBy = null;
        if (item.uploadedBy === userId && item.kind === "upload") {
          // Only delete the blob — the item reference stays in room state so
          // other players don't see it vanish mid-game. The client falls back
          // to a broken-image placeholder if the blob is gone.
        }
      }
      delete r.participants[userId];

      const activeSockets = await getRoomSockets(instanceId);
      if (!activeSockets || activeSockets.size === 0) {
        const t = getRoomTimer(instanceId);
        if (t) { clearTimeout(t); deleteRoomTimer(instanceId); }
        const rc = getReconcileTimer(instanceId);
        if (rc) { clearInterval(rc); deleteReconcileTimer(instanceId); }
        await deleteRoom(instanceId);
        await deleteRoomSockets(instanceId);
        console.log(`[room:${instanceId}] empty after grace period, deleted`);
        return;
      }

      if (r.hostId === userId) {
        const remainingUsers = [...new Set([...activeSockets.values()])];
        if (remainingUsers.length === 0) {
          const t = getRoomTimer(instanceId);
          if (t) { clearTimeout(t); deleteRoomTimer(instanceId); }
          await deleteRoom(instanceId);
          await deleteRoomSockets(instanceId);
          console.log(`[room:${instanceId}] empty after grace period, deleted`);
          return;
        }
        r.hostId = remainingUsers[Math.floor(Math.random() * remainingUsers.length)];
        console.log(`[room:${instanceId}] new host after grace period: ${r.hostId}`);
      }

      await setRoom(instanceId, r);
      console.log(`[room:${instanceId}] ${userId} evicted after grace period`);
      io.to(instanceId).emit("STATE_UPDATE", r);
    }, GRACE_MS);

    setPendingDisconnect(graceKey, timer);
  });
}
