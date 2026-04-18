import { getRoom, setRoom, getSocketInfo } from "../store.js";

const moves = ["rock", "paper", "scissors"];
const beats = { rock: "scissors", scissors: "paper", paper: "rock" };

export function registerDuelHandlers(io, socket) {
  socket.on("DUEL_CHALLENGE", async ({ itemId }) => {
    const info = await getSocketInfo(socket.id);
    if (!info) return;
    const { instanceId, userId: challengerId } = info;
    const room = await getRoom(instanceId);
    if (!room || room.phase !== "PLAYING") return;

    const item = room.items[itemId];
    if (!item || !item.ownedBy || item.ownedBy === challengerId) return;

    if ((room.failedDuels[itemId] ?? []).includes(challengerId)) return;

    const ownerId = item.ownedBy;

    let challengerMove, ownerMove;
    do {
      challengerMove = moves[Math.floor(Math.random() * 3)];
      ownerMove = moves[Math.floor(Math.random() * 3)];
    } while (challengerMove === ownerMove);

    const winnerId = beats[challengerMove] === ownerMove ? challengerId : ownerId;

    if (winnerId === challengerId) {
      item.ownedBy = challengerId;
    } else {
      if (!room.failedDuels[itemId]) room.failedDuels[itemId] = [];
      room.failedDuels[itemId].push(challengerId);
    }

    await setRoom(instanceId, room);
    io.to(instanceId).emit("DUEL_RESULT", {
      itemId, challengerId, ownerId, challengerMove, ownerMove, winnerId,
    });
    io.to(instanceId).emit("STATE_UPDATE", room);
  });
}
