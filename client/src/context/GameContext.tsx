import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import { useDiscord } from './DiscordContext';

// ---------------------------------------------------------------------------
// Shared types — mirrors server-side RoomState
// ---------------------------------------------------------------------------

export type Participant = {
  userId: string;
  username: string;
  avatar: string | null;
};

export type ImageItem = {
  id: string;
  /** How the image is sourced:
   *  - 'upload'    → locally uploaded file, encoded as base64 in `dataUrl`
   *  - 'tiermaker' → TierMaker CDN reference stored in `imageUrl`
   *  - 'text'      → rendered text tile, content stored in `text`
   */
  kind: 'upload' | 'tiermaker' | 'text';
  dataUrl: string;   // base64 data URI — only populated for kind='upload'
  imageUrl: string;  // TierMaker relative path — only populated for kind='tiermaker'
  text: string;      // tile text — only populated for kind='text'
  fileName: string;
  uploadedBy: string;
  lockedBy: string | null;
  ownedBy: string | null;
};

export type Tier = {
  id: string;
  label: string;
  color: string;
  itemIds: string[];
};

export type RoomState = {
  instanceId: string;
  phase: 'SETUP' | 'PLAYING';
  hostId: string;
  title: string;
  tiers: Tier[];
  items: Record<string, ImageItem>;
  bankItemIds: string[];
  participants: Record<string, Participant>;
};

// ---------------------------------------------------------------------------
// Context value
// ---------------------------------------------------------------------------

type GameContextValue = {
  roomState: RoomState | null;
  socket: Socket | null;
  currentUserId: string;
  isHost: boolean;
  /** Non-null error string if connection was rejected */
  rejectionReason: string | null;
  /** Set when the server rejects a lock attempt on an item */
  lockRejected: { itemId: string; lockedBy: string } | null;
  clearLockRejected: () => void;
  /** True after the host ends the session via END_SESSION */
  sessionEnded: boolean;
  /** Re-join the room after a session ends, starting a fresh game */
  resetSession: () => void;
};

const GameContext = createContext<GameContextValue>({
  roomState: null,
  socket: null,
  currentUserId: '',
  isHost: false,
  rejectionReason: null,
  lockRejected: null,
  clearLockRejected: () => {},
  sessionEnded: false,
  resetSession: () => {},
});

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function GameProvider({ children }: { children: React.ReactNode }) {
  const discord = useDiscord();
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  const [lockRejected, setLockRejected] = useState<{ itemId: string; lockedBy: string } | null>(null);
  const [sessionEnded, setSessionEnded] = useState(false);
  // Stable refs so the connect handler always sees fresh values without
  // needing to be re-registered (avoids stale closures on reconnect).
  const discordRef = useRef(discord);
  discordRef.current = discord;
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (discord.status !== 'ready') return;

    // In dev the Cloudflare Vite plugin's Worker middleware intercepts /ws/*
    // and proxies it via fetch(), which buffers the entire response. That
    // breaks Socket.IO long-polling (the server holds the connection open
    // waiting for events, so the buffering proxy times out and drops it).
    // Fix: connect directly to the backend in dev, bypassing the Worker.
    // In production the Worker proxy handles /ws/* correctly.
    const socketUrl = import.meta.env.DEV ? 'http://localhost:3001' : undefined;

    const sock = io(socketUrl!, {
      path: '/ws',
      // Start with polling so a Socket.IO session is established before upgrading.
      // WebSocket-first fails under heavy image-proxy load: the upgrade request
      // races with many concurrent HTTP requests and can fail, causing a
      // disconnect → reconnect loop. Once polling is stable it auto-upgrades.
      transports: ['polling', 'websocket'],
    });

    // Emitted on initial connect AND every auto-reconnect. The server
    // handles duplicate userId joins idempotently (no duplicate participants).
    sock.on('connect', () => {
      // Do NOT clear roomState here. The server keeps the room alive during
      // the grace period, so the stale state is still valid and will be
      // refreshed by the incoming STATE_UPDATE. Nulling it would unmount
      // SetupPage and destroy the user's local draft (items, tiers, title).
      const d = discordRef.current;
      if (d.status !== 'ready') return;
      const instanceId = d.discordSdk.instanceId;
      const { id: userId, username, avatar } = d.user;
      sock.emit('JOIN_ROOM', { instanceId, userId, username, avatar });
    });

    sock.on('STATE_UPDATE', (state: RoomState) => {
      setRoomState(state);
    });

    sock.on('CONNECTION_REJECTED', ({ reason }: { reason: string }) => {
      setRejectionReason(reason);
    });

    sock.on('UPLOAD_REJECTED', ({ reason }: { reason: string }) => {
      console.warn('[game] upload rejected:', reason);
    });

    sock.on('LOAD_TEMPLATE_PARTIAL', ({ loaded, total, reason }: { loaded: number; total: number; reason: string }) => {
      console.warn(`[game] template partially loaded (${loaded}/${total}):`, reason);
    });

    sock.on('LOCK_REJECTED', ({ itemId, lockedBy }: { itemId: string; lockedBy: string }) => {
      setLockRejected({ itemId, lockedBy });
    });

    sock.on('PHASE_RESET', () => {
      setRoomState(null);
      setSessionEnded(true);
    });

    sock.on('connect_error', (err) => {
      console.error('[socket] connect error:', err.message);
    });

    setSocket(sock);
    socketRef.current = sock;

    return () => {
      sock.disconnect();
      setSocket(null);
      socketRef.current = null;
      setRoomState(null);
    };
  }, [discord.status]); // eslint-disable-line react-hooks/exhaustive-deps

  function resetSession() {
    setSessionEnded(false);
    setRoomState(null);
    const d = discordRef.current;
    const sock = socketRef.current;
    if (sock && d.status === 'ready') {
      const { id: userId, username, avatar } = d.user;
      sock.emit('JOIN_ROOM', { instanceId: d.discordSdk.instanceId, userId, username, avatar });
    }
  }

  const currentUserId = discord.status === 'ready' ? discord.user.id : '';
  const isHost = !!roomState && roomState.hostId === currentUserId;

  return (
    <GameContext.Provider value={{
      roomState, socket, currentUserId, isHost, rejectionReason,
      lockRejected, clearLockRejected: () => setLockRejected(null), sessionEnded, resetSession,
    }}>
      {children}
    </GameContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGame() {
  return useContext(GameContext);
}
