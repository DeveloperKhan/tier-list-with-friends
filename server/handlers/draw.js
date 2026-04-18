import { getSocketInfo } from "../store.js";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

export function registerDrawHandlers(io, socket) {
  socket.on("DRAW_STROKE", async ({ x0, y0, x1, y1, color }) => {
    const info = await getSocketInfo(socket.id);
    if (!info) return;
    socket.to(info.instanceId).emit("DRAW_STROKE", {
      x0: Number(x0), y0: Number(y0),
      x1: Number(x1), y1: Number(y1),
      color: HEX_COLOR.test(color) ? color : "#ffffff",
    });
  });

  socket.on("DRAW_DOT", async ({ x, y, color }) => {
    const info = await getSocketInfo(socket.id);
    if (!info) return;
    socket.to(info.instanceId).emit("DRAW_DOT", {
      x: Number(x), y: Number(y),
      color: HEX_COLOR.test(color) ? color : "#ffffff",
    });
  });

  socket.on("DRAW_CLEAR", async () => {
    const info = await getSocketInfo(socket.id);
    if (!info) return;
    socket.to(info.instanceId).emit("DRAW_CLEAR");
  });

  socket.on("CONFETTI_BURST", async ({ x, y }) => {
    const info = await getSocketInfo(socket.id);
    if (!info) return;
    socket.to(info.instanceId).emit("CONFETTI_BURST", {
      x: Number(x), y: Number(y),
    });
  });
}
