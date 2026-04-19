import { useEffect, useState } from 'react';
import { useGame } from '@/context/GameContext';
import { useDiscord } from '@/context/DiscordContext';
import { getItemSrc, discordAvatarUrl } from '@/lib/utils';
import { Z } from '@/lib/constants';

const CURSOR_STALE_MS = 2000;

/** Renders other players' cursors. Cursor positions are emitted only during
 *  active interactions (drawing, dragging, confetti) — not on general mouse move. */
export function PlayerCursors() {
  const { cursors, currentUserId, roomState } = useGame();
  const discord = useDiscord();
  // Tick every 500 ms so stale cursors disappear promptly after CURSOR_STALE_MS.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 500);
    return () => clearInterval(id);
  }, []);

  if (!roomState || discord.status !== 'ready') return null;

  const now = Date.now();
  const participants = roomState.participants;
  const dragging: Record<string, (typeof roomState.items)[string]> = {};
  for (const item of Object.values(roomState.items)) {
    if (item.lockedBy && item.lockedBy !== currentUserId) {
      dragging[item.lockedBy] = item;
    }
  }

  return (
    <div style={{ zIndex: Z.cursors }} className="pointer-events-none fixed inset-0 overflow-hidden">
      {Object.entries(cursors).map(([userId, { x, y, lastSeen }]) => {
        if (userId === currentUserId) return null;
        if (now - lastSeen > CURSOR_STALE_MS) return null;
        const participant = participants[userId];
        if (!participant) return null;
        const draggedItem = dragging[userId];

        return (
          <div
            key={userId}
            className="absolute flex flex-col items-start gap-0.5 opacity-50"
            style={{
              left: `${x * 100}%`,
              top: `${y * 100}%`,
              transform: 'translate(4px, 4px)',
              transition: 'left 80ms linear, top 80ms linear',
            }}
          >
            {draggedItem && (
              <div className="absolute bottom-full mb-2 h-12 w-12 rounded-lg overflow-hidden border border-white/20 shadow-lg">
                {draggedItem.kind === 'text' ? (
                  <div className="h-full w-full flex items-center justify-center bg-[#1e1e2e] text-white text-[9px] font-bold text-center px-1 leading-tight">
                    {draggedItem.text}
                  </div>
                ) : (
                  <img src={getItemSrc(draggedItem)} alt="" className="h-full w-full object-cover" />
                )}
              </div>
            )}
            <svg width="12" height="16" viewBox="0 0 12 16" fill="none" className="drop-shadow">
              <path d="M0 0 L0 14 L4 10 L7 16 L9 15 L6 9 L12 9 Z" fill="white" />
              <path d="M0 0 L0 14 L4 10 L7 16 L9 15 L6 9 L12 9 Z" fill="currentColor" className="text-purple-500" fillOpacity="0.9" />
            </svg>
            <div className="flex items-center gap-1 rounded-full bg-black/70 pl-0.5 pr-2 py-0.5 backdrop-blur-sm border border-white/10">
              <img
                src={discordAvatarUrl(userId, participant.avatar)}
                alt={participant.username}
                className="h-4 w-4 rounded-full object-cover flex-none"
              />
              <span className="text-white text-[10px] font-semibold leading-none max-w-[80px] truncate">
                {participant.username}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
