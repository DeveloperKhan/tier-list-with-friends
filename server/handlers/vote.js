import { getRoom, setRoom, getSocketInfo } from "../store.js";

export function registerVoteHandlers(io, socket) {
  // ── VOTE_ITEM ─────────────────────────────────────────────────────────────
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

    const oppIdx = itemVotes[opposite].indexOf(userId);
    if (oppIdx !== -1) itemVotes[opposite].splice(oppIdx, 1);

    const sameIdx = itemVotes[vote].indexOf(userId);
    if (sameIdx !== -1) {
      itemVotes[vote].splice(sameIdx, 1);
    } else {
      itemVotes[vote].push(userId);
    }

    // Score = upvotes - downvotes. If <= -1 and item is in a tier, eject it.
    const score = itemVotes.up.length - itemVotes.down.length;
    if (score <= -1) {
      let tierIdx = -1;
      let itemPosInTier = -1;
      for (let i = 0; i < room.tiers.length; i++) {
        const pos = room.tiers[i].itemIds.indexOf(itemId);
        if (pos !== -1) { tierIdx = i; itemPosInTier = pos; break; }
      }
      if (tierIdx !== -1) {
        room.tiers[tierIdx].itemIds.splice(itemPosInTier, 1);
        room.bankItemIds.push(itemId);
        room.items[itemId].ownedBy = null;
        room.items[itemId].lockedBy = null;
        // Broadcast the downvote first so clients see the score update before ejection
        io.to(info.instanceId).emit("VOTE_CHANGED", { itemId, votes: itemVotes });
        delete room.votes[itemId];
        await setRoom(info.instanceId, room);
        io.to(info.instanceId).emit("ITEM_MOVED", {
          itemId,
          tierId: null,
          index: room.bankItemIds.length - 1,
          ownedBy: null,
          wasRejected: true,
        });
        return;
      }
    }

    await setRoom(info.instanceId, room);
    io.to(info.instanceId).emit("VOTE_CHANGED", { itemId, votes: itemVotes });
  });
}
