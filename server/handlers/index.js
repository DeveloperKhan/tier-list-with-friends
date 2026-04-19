import { registerRoomHandlers } from "./room.js";
import { registerItemHandlers } from "./items.js";
import { registerTierHandlers } from "./tiers.js";
import { registerDuelHandlers } from "./duel.js";
import { registerVoteHandlers } from "./vote.js";
import { registerCursorHandlers } from "./cursor.js";
import { registerDrawHandlers } from "./draw.js";
import { registerDisconnectHandler } from "./disconnect.js";

export function registerHandlers(io, socket) {
  registerRoomHandlers(io, socket);
  registerItemHandlers(io, socket);
  registerTierHandlers(io, socket);
  registerDuelHandlers(io, socket);
  registerVoteHandlers(io, socket);
  registerCursorHandlers(io, socket);
  registerDrawHandlers(io, socket);
  registerDisconnectHandler(io, socket);
}
