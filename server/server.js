import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import fetch from "node-fetch";
import { randomUUID } from "crypto";

dotenv.config({ path: new URL('../.env', import.meta.url) });

const SIDECAR_URL = process.env.TIERMAKER_SIDECAR_URL?.replace(/\/$/, "");

const app = express();
const port = 3001;

app.use(express.json({ limit: '10mb' }));

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.post("/api/token", async (req, res) => {
  try {
    const response = await fetch(`https://discord.com/api/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: process.env.VITE_DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code",
        code: req.body.code,
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error("[token exchange] Discord error:", data);
      return res.status(response.status).json({
        error: data.error_description ?? data.error ?? "Discord token exchange failed",
      });
    }

    res.send({ access_token: data.access_token });
  } catch (err) {
    console.error("[token exchange] Unexpected error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// TierMaker API — proxied to sidecar service
// ---------------------------------------------------------------------------

async function proxyToSidecar(path, res) {
  if (!SIDECAR_URL) {
    return res.status(503).json({
      error: "TierMaker sidecar is not configured (TIERMAKER_SIDECAR_URL not set)",
    });
  }
  try {
    const upstream = await fetch(`${SIDECAR_URL}${path}`);
    const contentType = upstream.headers.get("content-type") ?? "application/json";
    const cacheControl = upstream.headers.get("cache-control");
    res.status(upstream.status).set("Content-Type", contentType);
    if (cacheControl) res.set("Cache-Control", cacheControl);
    upstream.body.pipe(res);
  } catch (err) {
    console.error("[sidecar proxy]", err.message);
    res.status(502).json({ error: "Sidecar unreachable" });
  }
}

app.get("/api/tiermaker/search", (req, res) =>
  proxyToSidecar(`/search?q=${encodeURIComponent(req.query.q ?? "")}`, res)
);
app.get("/api/tiermaker/template", (req, res) =>
  proxyToSidecar(`/template?url=${encodeURIComponent(req.query.url ?? "")}`, res)
);
app.get("/api/tiermaker/image", (req, res) =>
  proxyToSidecar(`/image?url=${encodeURIComponent(req.query.url ?? "")}`, res)
);

app.get("/health", (_req, res) => res.sendStatus(200));

// ---------------------------------------------------------------------------
// In-memory room state
// ---------------------------------------------------------------------------

/** @type {Map<string, import('./types.js').RoomState>} */
const rooms = new Map();

/** instanceId -> Map<socketId, userId> */
const roomSockets = new Map();

/** socketId -> { instanceId, userId } */
const socketInfo = new Map();

/** `${instanceId}:${userId}` -> NodeJS.Timeout — grace period before full cleanup */
const pendingDisconnects = new Map();

const GRACE_MS = 30_000; // 30 s to reconnect before being removed from the room

const DEFAULT_TIERS = [
  { label: "S", color: "#FF4444" },
  { label: "A", color: "#FF8C00" },
  { label: "B", color: "#FFD700" },
  { label: "C", color: "#32CD32" },
  { label: "D", color: "#1E90FF" },
  { label: "F", color: "#9932CC" },
];

const MAX_PLAYERS = 30;
const MAX_ITEMS = 100;
const MAX_IMAGE_BYTES = 200_000; // ~150 KB base64 encoded

function createRoom(instanceId, hostId) {
  return {
    instanceId,
    phase: "SETUP",
    hostId,
    title: "",
    tiers: DEFAULT_TIERS.map((t) => ({
      id: randomUUID(),
      label: t.label,
      color: t.color,
      itemIds: [],
    })),
    items: {},
    bankItemIds: [],
    participants: {},
  };
}

// ---------------------------------------------------------------------------
// Socket.IO
// ---------------------------------------------------------------------------

const httpServer = createServer(app);
const io = new Server(httpServer, {
  path: "/ws",
  cors: { origin: "*" },
  // Give more headroom during heavy image-proxy bursts (template preview grid
  // fires many concurrent requests that compete with Socket.IO polling).
  pingTimeout: 60000,
  pingInterval: 25000,
  // Default is 1 MB — START_GAME payloads can contain many base64 images
  // (e.g. 60 items × 150 KB each ≈ 9 MB). Raise to 50 MB.
  maxHttpBufferSize: 50 * 1024 * 1024,
});

io.on("connection", (socket) => {
  console.log("[socket] connected:", socket.id);

  // ── JOIN_ROOM ────────────────────────────────────────────────────────────
  socket.on("JOIN_ROOM", ({ instanceId, userId, username, avatar }) => {
    if (!instanceId || !userId) return;

    let room = rooms.get(instanceId);
    if (!room) {
      room = createRoom(instanceId, userId);
      rooms.set(instanceId, room);
      roomSockets.set(instanceId, new Map());
    }

    // Cancel any pending grace-period cleanup for this user so the room
    // isn't torn down after they've already reconnected.
    const graceKey = `${instanceId}:${userId}`;
    if (pendingDisconnects.has(graceKey)) {
      clearTimeout(pendingDisconnects.get(graceKey));
      pendingDisconnects.delete(graceKey);
    }

    const sockets = roomSockets.get(instanceId);
    const isReturningUser = !!room.participants[userId];

    // Capacity check — only applies to genuinely new participants.
    if (!isReturningUser && Object.keys(room.participants).length >= MAX_PLAYERS) {
      socket.emit("CONNECTION_REJECTED", {
        reason: `Room is full (${MAX_PLAYERS} players maximum).`,
      });
      return;
    }

    sockets.set(socket.id, userId);
    socketInfo.set(socket.id, { instanceId, userId });
    socket.join(instanceId);

    // Always refresh participant info (name/avatar may have changed).
    room.participants[userId] = {
      userId,
      username: String(username ?? "Unknown").slice(0, 32),
      avatar: avatar ?? null,
    };

    io.to(instanceId).emit("STATE_UPDATE", room);

    const playerCount = Object.keys(room.participants).length;
    if (isReturningUser) {
      console.log(`[room:${instanceId}] ${username} reconnected (${playerCount} players)`);
    } else {
      console.log(`[room:${instanceId}] ${username} joined (${playerCount} players)`);
    }
  });

  // ── START_GAME (host only) ───────────────────────────────────────────────
  // Receives the complete setup form from the host and transitions to PLAYING.
  // All setup state (title, tiers, images) lives on the client until this point.
  socket.on("START_GAME", (payload) => {
    const { instanceId: payloadIid, userId: payloadUid, title, tiers, items, bankItemIds } = payload ?? {};
    const itemCount = Array.isArray(bankItemIds) ? bankItemIds.length : 0;
    console.log(`[START_GAME] received from ${socket.id} — ${itemCount} items, iid=${payloadIid}, uid=${payloadUid}`);

    let info = socketInfo.get(socket.id);
    if (!info) {
      // HMR / reconnect race: the socket reconnected but JOIN_ROOM hasn't
      // been processed yet. Use the payload to re-register retroactively.
      const room = rooms.get(payloadIid);
      if (!payloadIid || !payloadUid || !room || room.hostId !== payloadUid || !room.participants[payloadUid]) {
        console.log(`[START_GAME] rejected: socketInfo miss, socket=${socket.id}, iid=${payloadIid}, uid=${payloadUid}`);
        return;
      }
      if (!roomSockets.has(payloadIid)) roomSockets.set(payloadIid, new Map());
      roomSockets.get(payloadIid).set(socket.id, payloadUid);
      socketInfo.set(socket.id, { instanceId: payloadIid, userId: payloadUid });
      socket.join(payloadIid);
      info = { instanceId: payloadIid, userId: payloadUid };
      console.log(`[room:${payloadIid}] retroactive join via START_GAME for ${payloadUid}`);
    }
    const room = rooms.get(info.instanceId);
    if (!room || room.hostId !== info.userId) {
      console.log(`[START_GAME] rejected: room check failed — room=${!!room}, hostId=${room?.hostId}, userId=${info.userId}`);
      return;
    }

    // Validate and sanitise tiers
    const sanitisedTiers = Array.isArray(tiers)
      ? tiers.slice(0, 20).map((t) => ({
          id: String(t.id ?? randomUUID()).slice(0, 36),
          label: String(t.label ?? "").slice(0, 10),
          color: /^#[0-9a-fA-F]{6}$/.test(t.color) ? t.color : "#888888",
          itemIds: [],
        }))
      : [];

    // Validate and sanitise items — three kinds: 'upload', 'tiermaker', 'text'
    const sanitisedItems = {};
    const sanitisedBankIds = [];

    if (Array.isArray(bankItemIds) && typeof items === "object" && items !== null) {
      for (const id of bankItemIds) {
        if (sanitisedBankIds.length >= MAX_ITEMS) break;
        const item = items[id];
        if (!item) continue;

        const kind = item.kind;
        let sanitised = null;

        if (kind === "upload") {
          if (typeof item.dataUrl !== "string") continue;
          if (!item.dataUrl.startsWith("data:image/")) continue;
          if (item.dataUrl.length > MAX_IMAGE_BYTES) continue;
          sanitised = {
            id: String(id).slice(0, 36),
            kind: "upload",
            dataUrl: item.dataUrl,
            imageUrl: "",
            text: "",
            fileName: String(item.fileName ?? "image").slice(0, 255),
            uploadedBy: info.userId,
            lockedBy: null,
            ownedBy: null,
          };
        } else if (kind === "tiermaker") {
          if (typeof item.imageUrl !== "string") continue;
          const imgUrl = item.imageUrl;
          if (!imgUrl.startsWith("https://tiermaker.com/images/") && !imgUrl.startsWith("/images/")) continue;
          sanitised = {
            id: String(id).slice(0, 36),
            kind: "tiermaker",
            dataUrl: "",
            imageUrl: String(item.imageUrl).slice(0, 512),
            text: "",
            fileName: String(item.fileName ?? "image").slice(0, 255),
            uploadedBy: info.userId,
            lockedBy: null,
            ownedBy: null,
          };
        } else if (kind === "text") {
          if (typeof item.text !== "string" || !item.text.trim()) continue;
          sanitised = {
            id: String(id).slice(0, 36),
            kind: "text",
            dataUrl: "",
            imageUrl: "",
            text: String(item.text).slice(0, 200),
            fileName: String(item.fileName ?? "text").slice(0, 255),
            uploadedBy: info.userId,
            lockedBy: null,
            ownedBy: null,
          };
        } else {
          continue;
        }

        sanitisedItems[id] = sanitised;
        sanitisedBankIds.push(id);
      }
    }

    room.title = String(title ?? "").slice(0, 100);
    room.tiers = sanitisedTiers;
    room.items = sanitisedItems;
    room.bankItemIds = sanitisedBankIds;
    room.phase = "PLAYING";

    io.to(info.instanceId).emit("STATE_UPDATE", room);
    console.log(`[room:${info.instanceId}] game started — ${sanitisedBankIds.length} items, ${sanitisedTiers.length} tiers`);
  });

  // ── LOCK_ITEM ────────────────────────────────────────────────────────────
  socket.on("LOCK_ITEM", ({ itemId }) => {
    const info = socketInfo.get(socket.id);
    if (!info) return;
    const room = rooms.get(info.instanceId);
    if (!room || room.phase !== "PLAYING") return;

    const item = room.items[itemId];
    if (!item) return;

    // Reject if locked by someone else, or owned by someone else
    if (
      (item.lockedBy !== null && item.lockedBy !== info.userId) ||
      (item.ownedBy !== null && item.ownedBy !== info.userId)
    ) {
      socket.emit("LOCK_REJECTED", {
        itemId,
        lockedBy: item.lockedBy ?? item.ownedBy,
      });
      return;
    }

    item.lockedBy = info.userId;
    io.to(info.instanceId).emit("STATE_UPDATE", room);
  });

  // ── UNLOCK_ITEM ──────────────────────────────────────────────────────────
  socket.on("UNLOCK_ITEM", ({ itemId }) => {
    const info = socketInfo.get(socket.id);
    if (!info) return;
    const room = rooms.get(info.instanceId);
    if (!room) return;

    const item = room.items[itemId];
    if (!item) return;

    if (item.lockedBy === info.userId) {
      item.lockedBy = null;
    }

    io.to(info.instanceId).emit("STATE_UPDATE", room);
  });

  // ── MOVE_ITEM ────────────────────────────────────────────────────────────
  socket.on("MOVE_ITEM", ({ itemId, destination }) => {
    const info = socketInfo.get(socket.id);
    if (!info) return;
    const room = rooms.get(info.instanceId);
    if (!room || room.phase !== "PLAYING") return;

    const item = room.items[itemId];
    if (!item || item.lockedBy !== info.userId) return;

    // Remove from current location
    room.bankItemIds = room.bankItemIds.filter((id) => id !== itemId);
    for (const tier of room.tiers) {
      tier.itemIds = tier.itemIds.filter((id) => id !== itemId);
    }

    if (destination?.type === "tier") {
      const tier = room.tiers.find((t) => t.id === destination.tierId);
      if (!tier) {
        // Target tier not found — fall back to bank
        room.bankItemIds.push(itemId);
        item.ownedBy = null;
      } else {
        const idx =
          typeof destination.index === "number"
            ? Math.min(destination.index, tier.itemIds.length)
            : tier.itemIds.length;
        tier.itemIds.splice(idx, 0, itemId);
        item.ownedBy = info.userId;
      }
    } else {
      // type === 'bank' or unrecognised — return to bank
      room.bankItemIds.push(itemId);
      item.ownedBy = null;
    }

    item.lockedBy = null;
    io.to(info.instanceId).emit("STATE_UPDATE", room);
  });

  // ── EDIT_TIER (host only) ────────────────────────────────────────────────
  const TIER_PALETTE = [
    "#FF4444", "#FF8C00", "#FFD700", "#32CD32",
    "#1E90FF", "#9932CC", "#FF69B4", "#00CED1",
  ];

  socket.on("EDIT_TIER", ({ action, tierId, label, color, newIndex }) => {
    const info = socketInfo.get(socket.id);
    if (!info) return;
    const room = rooms.get(info.instanceId);
    if (!room || room.hostId !== info.userId || room.phase !== "PLAYING") return;

    if (action === "add") {
      room.tiers.push({
        id: randomUUID(),
        label: "New",
        color: TIER_PALETTE[room.tiers.length % TIER_PALETTE.length],
        itemIds: [],
      });
    } else if (action === "delete") {
      const idx = room.tiers.findIndex((t) => t.id === tierId);
      if (idx === -1) return;
      const [removed] = room.tiers.splice(idx, 1);
      for (const id of removed.itemIds) {
        room.bankItemIds.push(id);
        if (room.items[id]) room.items[id].ownedBy = null;
      }
    } else if (action === "rename") {
      const tier = room.tiers.find((t) => t.id === tierId);
      if (tier && typeof label === "string") {
        tier.label = label.slice(0, 10);
      }
    } else if (action === "recolor") {
      const tier = room.tiers.find((t) => t.id === tierId);
      if (tier && /^#[0-9a-fA-F]{6}$/.test(color)) {
        tier.color = color;
      }
    } else if (action === "reorder") {
      const fromIdx = room.tiers.findIndex((t) => t.id === tierId);
      if (fromIdx === -1 || typeof newIndex !== "number") return;
      const clamped = Math.max(0, Math.min(newIndex, room.tiers.length - 1));
      const [tier] = room.tiers.splice(fromIdx, 1);
      room.tiers.splice(clamped, 0, tier);
    }

    io.to(info.instanceId).emit("STATE_UPDATE", room);
  });

  // ── SET_TIERS (host only) — batch save from the edit-tiers modal ────────
  socket.on("SET_TIERS", ({ tiers: incoming }) => {
    const info = socketInfo.get(socket.id);
    if (!info) return;
    const room = rooms.get(info.instanceId);
    if (!room || room.hostId !== info.userId || room.phase !== "PLAYING") return;
    if (!Array.isArray(incoming)) return;

    // Build a lookup of existing tier itemIds so we can preserve them
    const existingItemIds = new Map(room.tiers.map((t) => [t.id, t.itemIds]));

    // Move items from deleted tiers to the bank
    const newTierIds = new Set(incoming.map((t) => String(t.id)));
    for (const tier of room.tiers) {
      if (!newTierIds.has(tier.id)) {
        for (const id of tier.itemIds) {
          room.bankItemIds.push(id);
          if (room.items[id]) room.items[id].ownedBy = null;
        }
      }
    }

    // Validate and build the new tiers list
    room.tiers = incoming.slice(0, 20).map((t) => ({
      id: String(t.id ?? randomUUID()).slice(0, 36),
      label: String(t.label ?? "").slice(0, 10),
      color: /^#[0-9a-fA-F]{6}$/.test(t.color) ? t.color : "#888888",
      itemIds: existingItemIds.get(String(t.id)) ?? [],
    }));

    io.to(info.instanceId).emit("STATE_UPDATE", room);
    console.log(`[room:${info.instanceId}] tiers updated by host (${room.tiers.length} tiers)`);
  });

  // ── UPLOAD_IMAGE (any player, PLAYING phase) ─────────────────────────────
  socket.on("UPLOAD_IMAGE", ({ dataUrl, fileName }) => {
    const info = socketInfo.get(socket.id);
    if (!info) return;
    const room = rooms.get(info.instanceId);
    if (!room || room.phase !== "PLAYING") return;

    if (typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
      socket.emit("UPLOAD_REJECTED", { reason: "Invalid image format." });
      return;
    }
    if (dataUrl.length > MAX_IMAGE_BYTES) {
      socket.emit("UPLOAD_REJECTED", { reason: "Image too large (max ~150 KB)." });
      return;
    }
    if (Object.keys(room.items).length >= MAX_ITEMS) {
      socket.emit("UPLOAD_REJECTED", {
        reason: `Room is at the ${MAX_ITEMS}-item limit.`,
      });
      return;
    }

    const id = randomUUID();
    room.items[id] = {
      id,
      kind: "upload",
      dataUrl,
      imageUrl: "",
      text: "",
      fileName: String(fileName ?? "image").slice(0, 255),
      uploadedBy: info.userId,
      lockedBy: null,
      ownedBy: null,
    };
    room.bankItemIds.push(id);

    io.to(info.instanceId).emit("STATE_UPDATE", room);
  });

  // ── ADD_TEXT_ITEM (any player, PLAYING phase) ────────────────────────────
  socket.on("ADD_TEXT_ITEM", ({ text }) => {
    const info = socketInfo.get(socket.id);
    if (!info) return;
    const room = rooms.get(info.instanceId);
    if (!room || room.phase !== "PLAYING") return;

    if (typeof text !== "string" || !text.trim()) return;
    if (Object.keys(room.items).length >= MAX_ITEMS) {
      socket.emit("UPLOAD_REJECTED", { reason: `Room is at the ${MAX_ITEMS}-item limit.` });
      return;
    }

    const label = String(text).trim().slice(0, 200);
    const id = randomUUID();
    room.items[id] = {
      id,
      kind: "text",
      dataUrl: "",
      imageUrl: "",
      text: label,
      fileName: label,
      uploadedBy: info.userId,
      lockedBy: null,
      ownedBy: null,
    };
    room.bankItemIds.push(id);

    io.to(info.instanceId).emit("STATE_UPDATE", room);
  });

  // ── LOAD_TEMPLATE (any player) ───────────────────────────────────────────
  socket.on("LOAD_TEMPLATE", ({ items: incoming }) => {
    const info = socketInfo.get(socket.id);
    if (!info) return;
    const room = rooms.get(info.instanceId);
    if (!room || room.phase !== "PLAYING") return;

    if (!Array.isArray(incoming)) return;

    const total = incoming.length;
    let loaded = 0;

    for (const rawItem of incoming) {
      if (Object.keys(room.items).length >= MAX_ITEMS) break;

      const kind = rawItem.kind;
      let newItem = null;

      if (kind === "tiermaker") {
        if (typeof rawItem.imageUrl !== "string") continue;
        if (!rawItem.imageUrl.startsWith("https://tiermaker.com/images/") && !rawItem.imageUrl.startsWith("/images/")) continue;
        newItem = {
          id: randomUUID(),
          kind: "tiermaker",
          dataUrl: "",
          imageUrl: String(rawItem.imageUrl).slice(0, 512),
          text: "",
          fileName: String(rawItem.fileName ?? "image").slice(0, 255),
          uploadedBy: info.userId,
          lockedBy: null,
          ownedBy: null,
        };
      } else if (kind === "upload") {
        if (typeof rawItem.dataUrl !== "string") continue;
        if (!rawItem.dataUrl.startsWith("data:image/")) continue;
        if (rawItem.dataUrl.length > MAX_IMAGE_BYTES) continue;
        newItem = {
          id: randomUUID(),
          kind: "upload",
          dataUrl: rawItem.dataUrl,
          imageUrl: "",
          text: "",
          fileName: String(rawItem.fileName ?? "image").slice(0, 255),
          uploadedBy: info.userId,
          lockedBy: null,
          ownedBy: null,
        };
      } else {
        continue;
      }

      room.items[newItem.id] = newItem;
      room.bankItemIds.push(newItem.id);
      loaded++;
    }

    if (loaded < total) {
      socket.emit("LOAD_TEMPLATE_PARTIAL", {
        loaded,
        total,
        reason: `Only ${loaded} of ${total} images fit within the ${MAX_ITEMS}-item limit.`,
      });
    }

    io.to(info.instanceId).emit("STATE_UPDATE", room);
  });

  // ── END_SESSION (host only) ──────────────────────────────────────────────
  socket.on("END_SESSION", () => {
    const info = socketInfo.get(socket.id);
    if (!info) return;
    const room = rooms.get(info.instanceId);
    if (!room || room.hostId !== info.userId) return;

    io.to(info.instanceId).emit("PHASE_RESET");

    rooms.delete(info.instanceId);
    roomSockets.delete(info.instanceId);
    console.log(`[room:${info.instanceId}] ended by host`);
  });

  // ── disconnect ───────────────────────────────────────────────────────────
  socket.on("disconnect", () => {
    console.log("[socket] disconnected:", socket.id);
    const info = socketInfo.get(socket.id);
    if (!info) return;

    socketInfo.delete(socket.id);

    const { instanceId, userId } = info;
    const sockets = roomSockets.get(instanceId);
    if (!sockets) return;

    sockets.delete(socket.id);

    const room = rooms.get(instanceId);
    if (!room) return;

    // If this user still has another socket open, nothing else to do.
    const userStillConnected = [...sockets.values()].some((uid) => uid === userId);
    if (userStillConnected) return;

    // Immediately release any active drag lock so other players aren't
    // blocked for the entire grace period. Owned placements stay in place.
    let lockReleased = false;
    for (const item of Object.values(room.items)) {
      if (item.lockedBy === userId) {
        item.lockedBy = null;
        item.ownedBy = null;
        for (const tier of room.tiers) {
          tier.itemIds = tier.itemIds.filter((id) => id !== item.id);
        }
        if (!room.bankItemIds.includes(item.id)) {
          room.bankItemIds.push(item.id);
        }
        lockReleased = true;
      }
    }
    if (lockReleased) {
      io.to(instanceId).emit("STATE_UPDATE", room);
    }

    // Start grace period — give the user 30 s to reconnect before evicting
    // them. This handles transient drops (image-loading spike, brief network
    // blip) without disrupting the room for everyone else.
    const graceKey = `${instanceId}:${userId}`;
    console.log(`[room:${instanceId}] ${userId} disconnected — grace period started (${GRACE_MS / 1000}s)`);

    const timer = setTimeout(() => {
      pendingDisconnects.delete(graceKey);

      const r = rooms.get(instanceId);
      if (!r || !r.participants[userId]) return; // already cleaned up or rejoined

      // Full cleanup: release owned items, remove participant
      for (const item of Object.values(r.items)) {
        if (item.ownedBy === userId) {
          item.ownedBy = null;
        }
      }
      delete r.participants[userId];

      const activeSockets = roomSockets.get(instanceId);
      if (!activeSockets || activeSockets.size === 0) {
        rooms.delete(instanceId);
        roomSockets.delete(instanceId);
        console.log(`[room:${instanceId}] empty after grace period, deleted`);
        return;
      }

      // Host re-election
      if (r.hostId === userId) {
        const remainingUsers = [...new Set([...activeSockets.values()])];
        if (remainingUsers.length === 0) {
          rooms.delete(instanceId);
          roomSockets.delete(instanceId);
          console.log(`[room:${instanceId}] empty after grace period, deleted`);
          return;
        }
        r.hostId = remainingUsers[Math.floor(Math.random() * remainingUsers.length)];
        console.log(`[room:${instanceId}] new host after grace period: ${r.hostId}`);
      }

      console.log(`[room:${instanceId}] ${userId} evicted after grace period`);
      io.to(instanceId).emit("STATE_UPDATE", r);
    }, GRACE_MS);

    pendingDisconnects.set(graceKey, timer);
  });
});

httpServer.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});

process.on("SIGTERM", () => httpServer.close());
process.on("SIGINT", () => httpServer.close());
