import { registerRoomHandlers } from "./room.js";
import { registerItemHandlers } from "./items.js";
import { registerTierHandlers } from "./tiers.js";
import { registerDuelHandlers } from "./duel.js";
import { registerCursorHandlers } from "./cursor.js";
import { registerDisconnectHandler } from "./disconnect.js";

export function registerHandlers(io, socket) {
  registerRoomHandlers(io, socket);
  registerItemHandlers(io, socket);
  registerTierHandlers(io, socket);
  registerDuelHandlers(io, socket);
  registerCursorHandlers(io, socket);
  registerDisconnectHandler(io, socket);
}
