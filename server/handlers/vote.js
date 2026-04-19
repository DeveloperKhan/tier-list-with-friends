import { getRoom, setRoom, getSocketInfo } from "../store.js";

export function registerVoteHandlers(io, socket) {
  // ── VOTE_ITEM ─────────────────────────────────────────────────────────────
  // Payload: { itemId, vote: 'up' | 'down' }
  // Rules:
  //   - Player can vote 'up' or 'down' on any item
  //   - Voting the same direction twice removes the vote (toggle)
  //   - Switching direction moves the vote to the new side
  socket.on("VOTE_ITEM", async ({ itemId, vote }) => {
    if (vote !== "up" && vote !== "down") return;

    const info = await getSocketInfo(socket.id);
    if (!info) return;
    const room = await getRoom(info.instanceId);
    if (!room || room.phase !== "PLAYING") return;
    if (!room.items[itemId]) return;

    if (!room.votes) room.votes = {};
    if (!room.votes[itemId]) room.votes[itemId] = { up: [], down: [] };

    const itemVotes = room.votes[itemId];
    const userId = info.userId;
    const opposite = vote === "up" ? "down" : "up";

    // Remove from opposite side if present
    const oppIdx = itemVotes[opposite].indexOf(userId);
    if (oppIdx !== -1) itemVotes[opposite].splice(oppIdx, 1);

    // Toggle on same side
    const sameIdx = itemVotes[vote].indexOf(userId);
    if (sameIdx !== -1) {
      itemVotes[vote].splice(sameIdx, 1); // already voted this way — remove
    } else {
      itemVotes[vote].push(userId);
    }

    await setRoom(info.instanceId, room);

    // Targeted delta — no full STATE_UPDATE needed
    io.to(info.instanceId).emit("VOTE_CHANGED", {
      itemId,
      votes: itemVotes,
    });
  });
}
