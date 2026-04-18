import { randomUUID } from "crypto";
import {
  getRoom, setRoom, deleteRoom,
  getRoomSockets, setRoomSockets, deleteRoomSockets,
  getSocketInfo, setSocketInfo,
  getPendingDisconnect, deletePendingDisconnect,
} from "../store.js";
import { put as putImage, delMany } from "../images.js";
import { sanitizeTier, sanitizeItem } from "../lib/sanitize.js";
import { DEFAULT_TIERS, MAX_PLAYERS, MAX_ITEMS } from "../lib/constants.js";

function createRoom(instanceId, hostId) {
  return {
    instanceId,
    phase: "SETUP",
    hostId,
    title: "",
    tiers: DEFAULT_TIERS.map((t) => ({ id: randomUUID(), ...t, itemIds: [] })),
    items: {},
    bankItemIds: [],
    participants: {},
    failedDuels: {},
  };
}

export function registerRoomHandlers(io, socket) {
  // ── JOIN_ROOM ─────────────────────────────────────────────────────────────
  socket.on("JOIN_ROOM", async ({ instanceId, userId, username, avatar }) => {
    if (!instanceId || !userId) return;

    let room = await getRoom(instanceId);
    if (!room) {
      room = createRoom(instanceId, userId);
      await setRoom(instanceId, room);
      await setRoomSockets(instanceId, new Map());
    }

    // Cancel any pending grace-period cleanup so the room isn't torn down
    // after the user has already reconnected.
    const graceKey = `${instanceId}:${userId}`;
    const pendingTimer = getPendingDisconnect(graceKey);
    if (pendingTimer) {
      clearTimeout(pendingTimer);
      deletePendingDisconnect(graceKey);
    }

    const sockets = await getRoomSockets(instanceId);
    const isReturningUser = !!room.participants[userId];

    if (!isReturningUser && Object.keys(room.participants).length >= MAX_PLAYERS) {
      socket.emit("CONNECTION_REJECTED", {
        reason: `Room is full (${MAX_PLAYERS} players maximum).`,
      });
      return;
    }

    sockets.set(socket.id, userId);
    await setSocketInfo(socket.id, { instanceId, userId });
    socket.join(instanceId);

    room.participants[userId] = {
      userId,
      username: String(username ?? "Unknown").slice(0, 32),
      avatar: avatar ?? null,
    };
    await setRoom(instanceId, room);

    io.to(instanceId).emit("STATE_UPDATE", room);

    const playerCount = Object.keys(room.participants).length;
    console.log(
      `[room:${instanceId}] ${username} ${isReturningUser ? "reconnected" : "joined"} (${playerCount} players)`
    );
  });

  // ── START_GAME (host only) ────────────────────────────────────────────────
  socket.on("START_GAME", async (payload) => {
    const { instanceId: payloadIid, userId: payloadUid, title, tiers, items, bankItemIds } = payload ?? {};
    const itemCount = Array.isArray(bankItemIds) ? bankItemIds.length : 0;
    console.log(`[START_GAME] received from ${socket.id} — ${itemCount} items, iid=${payloadIid}, uid=${payloadUid}`);

    let info = await getSocketInfo(socket.id);
    if (!info) {
      // HMR / reconnect race: socket reconnected before JOIN_ROOM processed.
      const room = await getRoom(payloadIid);
      if (!payloadIid || !payloadUid || !room || room.hostId !== payloadUid || !room.participants[payloadUid]) {
        console.log(`[START_GAME] rejected: socketInfo miss, socket=${socket.id}`);
        return;
      }
      let sockets = await getRoomSockets(payloadIid);
      if (!sockets) {
        sockets = new Map();
        await setRoomSockets(payloadIid, sockets);
      }
      sockets.set(socket.id, payloadUid);
      await setSocketInfo(socket.id, { instanceId: payloadIid, userId: payloadUid });
      socket.join(payloadIid);
      info = { instanceId: payloadIid, userId: payloadUid };
      console.log(`[room:${payloadIid}] retroactive join via START_GAME for ${payloadUid}`);
    }

    const room = await getRoom(info.instanceId);
    if (!room || room.hostId !== info.userId) {
      console.log(`[START_GAME] rejected: not host`);
      return;
    }

    const sanitisedTiers = Array.isArray(tiers)
      ? tiers.slice(0, 20).map(sanitizeTier)
      : [];

    const sanitisedItems = {};
    const sanitisedBankIds = [];
    const imageWrites = [];

    if (Array.isArray(bankItemIds) && typeof items === "object" && items !== null) {
      for (const id of bankItemIds) {
        if (sanitisedBankIds.length >= MAX_ITEMS) break;
        const raw = items[id];
        if (!raw) continue;

        const result = sanitizeItem({ ...raw, id }, info.userId);
        if (!result) continue;

        sanitisedItems[result.item.id] = result.item;
        sanitisedBankIds.push(result.item.id);
        if (result.dataUrl) imageWrites.push(putImage(result.item.id, result.dataUrl));
      }
    }

    await Promise.all(imageWrites);

    room.title = String(title ?? "").slice(0, 100);
    room.tiers = sanitisedTiers;
    room.items = sanitisedItems;
    room.bankItemIds = sanitisedBankIds;
    room.phase = "PLAYING";
    await setRoom(info.instanceId, room);

    io.to(info.instanceId).emit("STATE_UPDATE", room);
    console.log(`[room:${info.instanceId}] game started — ${sanitisedBankIds.length} items, ${sanitisedTiers.length} tiers`);
  });

  // ── END_SESSION (host only) ───────────────────────────────────────────────
  socket.on("END_SESSION", async () => {
    const info = await getSocketInfo(socket.id);
    if (!info) return;
    const room = await getRoom(info.instanceId);
    if (!room || room.hostId !== info.userId) return;

    io.to(info.instanceId).emit("PHASE_RESET");

    // Clean up all upload images for this room.
    const uploadIds = Object.values(room.items)
      .filter((item) => item.kind === "upload")
      .map((item) => item.id);
    await delMany(uploadIds);

    await deleteRoom(info.instanceId);
    await deleteRoomSockets(info.instanceId);
    console.log(`[room:${info.instanceId}] ended by host`);
  });
}
