// In-memory implementation of the room state store.
// Every function is async — replacing this module with a Redis adapter
// requires no changes to callers.

const rooms = new Map();
const roomSockets = new Map(); // instanceId -> Map<socketId, userId>
const socketInfo = new Map();  // socketId -> { instanceId, userId }

// Pending disconnect timers are kept sync-only (NodeJS.Timeout handles aren't
// serialisable to Redis; use a job queue there instead).
const pendingDisconnects = new Map(); // `${instanceId}:${userId}` -> Timeout
const roomTimers = new Map();         // instanceId -> Timeout (max-lifetime)

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

export async function getRoom(instanceId) {
  return rooms.get(instanceId) ?? null;
}

export async function setRoom(instanceId, room) {
  rooms.set(instanceId, room);
}

export async function deleteRoom(instanceId) {
  rooms.delete(instanceId);
}

// ---------------------------------------------------------------------------
// Room socket maps
// ---------------------------------------------------------------------------

export async function getRoomSockets(instanceId) {
  return roomSockets.get(instanceId) ?? null;
}

export async function setRoomSockets(instanceId, map) {
  roomSockets.set(instanceId, map);
}

export async function deleteRoomSockets(instanceId) {
  roomSockets.delete(instanceId);
}

// ---------------------------------------------------------------------------
// Per-socket metadata
// ---------------------------------------------------------------------------

export async function getSocketInfo(socketId) {
  return socketInfo.get(socketId) ?? null;
}

export async function setSocketInfo(socketId, info) {
  socketInfo.set(socketId, info);
}

export async function deleteSocketInfo(socketId) {
  socketInfo.delete(socketId);
}

// ---------------------------------------------------------------------------
// Pending disconnect timers (sync — not Redis-portable as-is)
// ---------------------------------------------------------------------------

export function getPendingDisconnect(key) {
  return pendingDisconnects.get(key);
}

export function setPendingDisconnect(key, timer) {
  pendingDisconnects.set(key, timer);
}

export function deletePendingDisconnect(key) {
  pendingDisconnects.delete(key);
}

// ---------------------------------------------------------------------------
// Room max-lifetime timers (sync — not Redis-portable as-is)
// ---------------------------------------------------------------------------

export function getRoomTimer(instanceId) {
  return roomTimers.get(instanceId);
}

export function setRoomTimer(instanceId, timer) {
  roomTimers.set(instanceId, timer);
}

export function deleteRoomTimer(instanceId) {
  roomTimers.delete(instanceId);
}
