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
  dataUrl: string;
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
};

const GameContext = createContext<GameContextValue>({
  roomState: null,
  socket: null,
  currentUserId: '',
  isHost: false,
  rejectionReason: null,
});

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function GameProvider({ children }: { children: React.ReactNode }) {
  const discord = useDiscord();
  const [roomState, setRoomState] = useState<RoomState | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string | null>(null);
  // Stable refs so the connect handler always sees fresh values without
  // needing to be re-registered (avoids stale closures on reconnect).
  const discordRef = useRef(discord);
  discordRef.current = discord;

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
      transports: ['polling', 'websocket'],
    });

    // Emitted on initial connect AND every auto-reconnect. The server
    // handles duplicate userId joins idempotently (no duplicate participants).
    sock.on('connect', () => {
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

    sock.on('connect_error', (err) => {
      console.error('[socket] connect error:', err.message);
    });

    setSocket(sock);

    return () => {
      sock.disconnect();
      setSocket(null);
      setRoomState(null);
    };
  }, [discord.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const currentUserId = discord.status === 'ready' ? discord.user.id : '';
  const isHost = !!roomState && roomState.hostId === currentUserId;

  return (
    <GameContext.Provider value={{ roomState, socket, currentUserId, isHost, rejectionReason }}>
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
