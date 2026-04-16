import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import fetch from "node-fetch";
dotenv.config({ path: new URL('../.env', import.meta.url) });

const SIDECAR_URL = process.env.TIERMAKER_SIDECAR_URL?.replace(/\/$/, "");

const app = express();
const port = 3001;

// Allow express to parse JSON bodies
app.use(express.json());

app.post("/api/token", async (req, res) => {
  try {
    // Exchange the code for an access_token
    const response = await fetch(`https://discord.com/api/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
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
      return res.status(response.status).json({ error: data.error_description ?? data.error ?? "Discord token exchange failed" });
    }

    // Return the access_token to our client as { access_token: "..."}
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
    return res.status(503).json({ error: "TierMaker sidecar is not configured (TIERMAKER_SIDECAR_URL not set)" });
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

// ---------------------------------------------------------------------------

app.get("/health", (_req, res) => res.sendStatus(200));

// ---------------------------------------------------------------------------

const httpServer = createServer(app);
const io = new Server(httpServer, {
  path: "/ws",
  cors: { origin: "*" },
});

io.on("connection", (socket) => {
  console.log("[socket] connected:", socket.id);

  socket.on("disconnect", () => {
    console.log("[socket] disconnected:", socket.id);
  });
});

httpServer.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});

process.on("SIGTERM", () => httpServer.close());
process.on("SIGINT",  () => httpServer.close());
