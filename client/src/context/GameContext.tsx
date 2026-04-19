import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { io, type Socket } from 'socket.io-client';
import * as msgpackParser from 'socket.io-msgpack-parser';
import { useDiscord } from './DiscordContext';

// ---------------------------------------------------------------------------
// Shared types — mirrors server-side RoomState
// ---------------------------------------------------------------------------

export type Participant = {
  userId: string;
  username: string;
  avatar: string | null;
  index: number;
};

export type ImageItem = {
  id: string;
  /** How the image is sourced:
   *  - 'upload'    → user-uploaded file; blob lives in server images store,
   *                  served via GET /api/image/:id. dataUrl is always "" here.
   *  - 'tiermaker' → TierMaker CDN reference stored in `imageUrl`
   *  - 'text'      → rendered text tile, content stored in `text`
   */
  kind: 'upload' | 'tiermaker' | 'text';
  dataUrl: string;   // always "" in STATE_UPDATE — blob is served via /api/image/:id
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
  failedDuels: Record<string, string[]>; // itemId -> userId[] (legacy, kept for server compat)
  votes: Record<string, { up: string[]; down: string[] }>; // itemId -> { up: userId[], down: userId[] }
};

export type DuelResult = {
  itemId: string;
  challengerId: string;
  ownerId: string;
  challengerMove: 'rock' | 'paper' | 'scissors';
  ownerMove: 'rock' | 'paper' | 'scissors';
  winnerId: string;
};

// ---------------------------------------------------------------------------
// Context value
// ---------------------------------------------------------------------------

export type CursorPosition = { x: number; y: number; lastSeen: number };

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
  /** True after the host ends the session or the room times out */
  sessionEnded: boolean;
  /** Non-null when sessionEnded was caused by the 8-hour room timeout */
  sessionEndReason: string | null;
  /** Re-join the room after a session ends, starting a fresh game */
  resetSession: () => void;
  /** Live cursor positions for all other players: userId → {x, y} (0-1 normalized) */
  cursors: Record<string, CursorPosition>;
  /** Active duel result waiting to be animated, null when idle */
  activeDuel: DuelResult | null;
  clearActiveDuel: () => void;
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
  sessionEndReason: null,
  resetSession: () => {},
  cursors: {},
  activeDuel: null,
  clearActiveDuel: () => {},
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
  const [sessionEndReason, setSessionEndReason] = useState<string | null>(null);
  const [cursors, setCursors] = useState<Record<string, CursorPosition>>({});
  const [activeDuel, setActiveDuel] = useState<DuelResult | null>(null);
  // Stable refs so the connect handler always sees fresh values without
  // needing to be re-registered (avoids stale closures on reconnect).
  const discordRef = useRef(discord);
  discordRef.current = discord;
  const socketRef = useRef<Socket | null>(null);
  // Maps participant.index (uint8) → userId for binary cursor decoding.
  // Updated whenever STATE_UPDATE arrives.
  const playerIndexRef = useRef<Record<number, string>>({});

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
      // Prefer WebSocket first; fall back to polling only if the upgrade fails.
      // The Worker now returns the upstream fetch directly for /ws/* so the
      // 101 handshake is preserved and the upgrade succeeds in production.
      transports: ['websocket', 'polling'],
      parser: msgpackParser,
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
      const map: Record<number, string> = {};
      for (const p of Object.values(state.participants)) map[p.index] = p.userId;
      playerIndexRef.current = map;
    });

    sock.on('ITEM_LOCK_CHANGED', ({ itemId, lockedBy }: { itemId: string; lockedBy: string | null }) => {
      setRoomState((prev) => {
        if (!prev || !prev.items[itemId]) return prev;
        return {
          ...prev,
          items: {
            ...prev.items,
            [itemId]: { ...prev.items[itemId], lockedBy },
          },
        };
      });
    });

    sock.on('ITEM_MOVED', ({ itemId, tierId, index, ownedBy }: {
      itemId: string;
      tierId: string | null;
      index: number | null;
      ownedBy: string | null;
    }) => {
      setRoomState((prev) => {
        if (!prev || !prev.items[itemId]) return prev;

        // Remove item from its current location
        const newBankItemIds = prev.bankItemIds.filter((id) => id !== itemId);
        const newTiers = prev.tiers.map((t) => ({
          ...t,
          itemIds: t.itemIds.filter((id) => id !== itemId),
        }));

        if (tierId !== null) {
          // Place into a tier
          const tierIdx = newTiers.findIndex((t) => t.id === tierId);
          if (tierIdx !== -1) {
            const insertAt = index ?? newTiers[tierIdx].itemIds.length;
            newTiers[tierIdx] = {
              ...newTiers[tierIdx],
              itemIds: [
                ...newTiers[tierIdx].itemIds.slice(0, insertAt),
                itemId,
                ...newTiers[tierIdx].itemIds.slice(insertAt),
              ],
            };
          }
        } else {
          // Place into bank
          const insertAt = index ?? newBankItemIds.length;
          newBankItemIds.splice(insertAt, 0, itemId);
        }

        const newVotes = tierId === null && prev.votes?.[itemId]
          ? { ...prev.votes, [itemId]: undefined }
          : prev.votes;

        return {
          ...prev,
          tiers: newTiers,
          bankItemIds: newBankItemIds,
          items: {
            ...prev.items,
            [itemId]: { ...prev.items[itemId], lockedBy: null, ownedBy },
          },
          votes: newVotes as typeof prev.votes,
        };
      });
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

    sock.on('PHASE_RESET', ({ reason }: { reason?: string } = {}) => {
      setRoomState(null);
      setSessionEnded(true);
      setSessionEndReason(reason === 'timeout' ? 'The session was automatically closed after 8 hours.' : null);
      setCursors({});
    });

    sock.on('CURSOR_UPDATE', (buf: ArrayBuffer) => {
      const view = new DataView(buf instanceof ArrayBuffer ? buf : (buf as { buffer: ArrayBuffer }).buffer);
      const userId = playerIndexRef.current[view.getUint8(0)];
      if (!userId) return;
      const x = view.getUint8(1) / 255;
      const y = view.getUint8(2) / 255;
      setCursors((prev) => ({ ...prev, [userId]: { x, y, lastSeen: Date.now() } }));
    });

    sock.on('VOTE_CHANGED', ({ itemId, votes }: { itemId: string; votes: { up: string[]; down: string[] } }) => {
      setRoomState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          votes: { ...prev.votes, [itemId]: votes },
        };
      });
    });

    sock.on('DUEL_RESULT', (result: DuelResult) => {
      setActiveDuel(result);
    });

    sock.on('CURSOR_REMOVE', ({ userId }: { userId: string }) => {
      setCursors((prev) => {
        const next = { ...prev };
        delete next[userId];
        return next;
      });
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
    setSessionEndReason(null);
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
      lockRejected, clearLockRejected: () => setLockRejected(null), sessionEnded, sessionEndReason, resetSession, cursors,
      activeDuel, clearActiveDuel: () => setActiveDuel(null),
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
