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
  socket.on("START_GAME", ({ title, tiers, items, bankItemIds }) => {
    const info = socketInfo.get(socket.id);
    if (!info) return;
    const room = rooms.get(info.instanceId);
    if (!room || room.hostId !== info.userId) return;

    // Validate and sanitise tiers
    const sanitisedTiers = Array.isArray(tiers)
      ? tiers.slice(0, 20).map((t) => ({
          id: String(t.id ?? randomUUID()).slice(0, 36),
          label: String(t.label ?? "").slice(0, 10),
          color: /^#[0-9a-fA-F]{6}$/.test(t.color) ? t.color : "#888888",
          itemIds: [],
        }))
      : [];

    // Validate and sanitise items — reject anything oversized or non-image
    const sanitisedItems = {};
    const sanitisedBankIds = [];

    if (Array.isArray(bankItemIds) && typeof items === "object" && items !== null) {
      for (const id of bankItemIds) {
        if (sanitisedBankIds.length >= MAX_ITEMS) break;
        const item = items[id];
        if (!item) continue;
        if (typeof item.dataUrl !== "string") continue;
        if (!item.dataUrl.startsWith("data:image/")) continue;
        if (item.dataUrl.length > MAX_IMAGE_BYTES) continue;

        sanitisedItems[id] = {
          id: String(id).slice(0, 36),
          dataUrl: item.dataUrl,
          fileName: String(item.fileName ?? "image").slice(0, 255),
          uploadedBy: info.userId,
          lockedBy: null,
          ownedBy: null,
        };
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

    // Remove participant only if this user has no remaining sockets.
    const userStillConnected = [...sockets.values()].some((uid) => uid === userId);
    if (!userStillConnected) {
      delete room.participants[userId];
    }

    if (sockets.size === 0) {
      rooms.delete(instanceId);
      roomSockets.delete(instanceId);
      console.log(`[room:${instanceId}] empty, deleted`);
      return;
    }

    // Host re-election — only when the host user is fully gone (no sockets left).
    if (room.hostId === userId && !userStillConnected) {
      const remainingUsers = [...new Set([...sockets.values()])];
      room.hostId = remainingUsers[Math.floor(Math.random() * remainingUsers.length)];
      console.log(`[room:${instanceId}] new host: ${room.hostId}`);
    }

    io.to(instanceId).emit("STATE_UPDATE", room);
  });
});

httpServer.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});

process.on("SIGTERM", () => httpServer.close());
process.on("SIGINT", () => httpServer.close());
