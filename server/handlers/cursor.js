import { getSocketInfo, getRoom } from "../store.js";

export function registerCursorHandlers(io, socket) {
  socket.on("CURSOR_MOVE", async ({ x, y }) => {
    const info = await getSocketInfo(socket.id);
    if (!info) return;
    const room = await getRoom(info.instanceId);
    if (!room) return;
    const participant = room.participants[info.userId];
    if (!participant) return;

    const buf = Buffer.alloc(3);
    buf[0] = participant.index & 0xff;
    buf[1] = Math.round(Math.max(0, Math.min(1, Number(x) || 0)) * 255);
    buf[2] = Math.round(Math.max(0, Math.min(1, Number(y) || 0)) * 255);
    socket.to(info.instanceId).emit("CURSOR_UPDATE", buf);
  });
}
