import { getSocketInfo } from "../store.js";

export function registerCursorHandlers(io, socket) {
  socket.on("CURSOR_MOVE", async ({ x, y }) => {
    const info = await getSocketInfo(socket.id);
    if (!info) return;
    socket.to(info.instanceId).emit("CURSOR_UPDATE", {
      userId: info.userId,
      x: Math.max(0, Math.min(1, Number(x) || 0)),
      y: Math.max(0, Math.min(1, Number(y) || 0)),
    });
  });
}
