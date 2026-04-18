import dotenv from "dotenv";
dotenv.config({ path: new URL('../.env', import.meta.url) });

import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

import tokenRouter from "./routes/token.js";
import tiermakerRouter from "./routes/tiermaker.js";
import imageRouter from "./routes/image.js";
import { registerHandlers } from "./handlers/index.js";

const app = express();
const port = 3001;

app.use(express.json({ limit: '10mb' }));

app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.use("/api", tokenRouter);
app.use("/api/tiermaker", tiermakerRouter);
app.use("/api/image", imageRouter);
app.get("/health", (_req, res) => res.sendStatus(200));

const httpServer = createServer(app);
const io = new Server(httpServer, {
  path: "/ws",
  cors: { origin: "*" },
  pingTimeout: 60000,
  pingInterval: 25000,
});

io.on("connection", (socket) => {
  console.log("[socket] connected:", socket.id);
  registerHandlers(io, socket);
});

httpServer.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});

process.on("SIGTERM", () => httpServer.close());
process.on("SIGINT", () => httpServer.close());
