import { getSocketInfo, setSocketInfo, getRoom, getRoomSockets } from "../store.js";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function clamp01(v) { return Math.max(0, Math.min(1, v || 0)); }

async function emitToVisible(io, instanceId, senderSocketId, event, data) {
  const sockets = await getRoomSockets(instanceId);
  if (!sockets) return;
  for (const [sid] of sockets) {
    if (sid === senderSocketId) continue;
    const info = await getSocketInfo(sid);
    if (info?.drawingsHidden) continue;
    io.to(sid).emit(event, data);
  }
}

export function registerDrawHandlers(io, socket) {
  socket.on("SET_DRAWINGS_VISIBLE", async ({ visible }) => {
    const info = await getSocketInfo(socket.id);
    if (!info) return;
    await setSocketInfo(socket.id, { drawingsHidden: !visible });
  });

  socket.on("DRAW_STROKE", async ({ x0, y0, x1, y1, color }) => {
    const info = await getSocketInfo(socket.id);
    if (!info) return;
    const room = await getRoom(info.instanceId);
    if (!room) return;
    const participant = room.participants[info.userId];
    if (!participant) return;
    const hex = HEX_COLOR.test(color) ? color : "#ffffff";
    const buf = Buffer.alloc(8);
    buf[0] = participant.index & 0xff;
    buf[1] = Math.round(clamp01(Number(x0)) * 255);
    buf[2] = Math.round(clamp01(Number(y0)) * 255);
    buf[3] = Math.round(clamp01(Number(x1)) * 255);
    buf[4] = Math.round(clamp01(Number(y1)) * 255);
    buf[5] = parseInt(hex.slice(1, 3), 16);
    buf[6] = parseInt(hex.slice(3, 5), 16);
    buf[7] = parseInt(hex.slice(5, 7), 16);
    await emitToVisible(io, info.instanceId, socket.id, "DRAW_STROKE", buf);
  });

  socket.on("DRAW_DOT", async ({ x, y, color }) => {
    const info = await getSocketInfo(socket.id);
    if (!info) return;
    const room = await getRoom(info.instanceId);
    if (!room) return;
    const participant = room.participants[info.userId];
    if (!participant) return;
    const hex = HEX_COLOR.test(color) ? color : "#ffffff";
    const buf = Buffer.alloc(6);
    buf[0] = participant.index & 0xff;
    buf[1] = Math.round(clamp01(Number(x)) * 255);
    buf[2] = Math.round(clamp01(Number(y)) * 255);
    buf[3] = parseInt(hex.slice(1, 3), 16);
    buf[4] = parseInt(hex.slice(3, 5), 16);
    buf[5] = parseInt(hex.slice(5, 7), 16);
    await emitToVisible(io, info.instanceId, socket.id, "DRAW_DOT", buf);
  });

  socket.on("DRAW_CLEAR", async () => {
    const info = await getSocketInfo(socket.id);
    if (!info) return;
    const room = await getRoom(info.instanceId);
    if (!room) return;
    const participant = room.participants[info.userId];
    if (!participant) return;
    const buf = Buffer.alloc(1);
    buf[0] = participant.index & 0xff;
    await emitToVisible(io, info.instanceId, socket.id, "DRAW_CLEAR", buf);
  });

  socket.on("CONFETTI_BURST", async ({ x, y }) => {
    const info = await getSocketInfo(socket.id);
    if (!info) return;
    const buf = Buffer.alloc(2);
    buf[0] = Math.round(clamp01(Number(x)) * 255);
    buf[1] = Math.round(clamp01(Number(y)) * 255);
    await emitToVisible(io, info.instanceId, socket.id, "CONFETTI_BURST", buf);
  });
}
