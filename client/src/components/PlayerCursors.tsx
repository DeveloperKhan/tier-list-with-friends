import { useEffect, useRef } from 'react';
import { useGame } from '@/context/GameContext';
import { useDiscord } from '@/context/DiscordContext';
import { getItemSrc, discordAvatarUrl } from '@/lib/utils';

/** Emits throttled CURSOR_MOVE events and renders other players' cursors. */
export function PlayerCursors() {
  const { socket, cursors, currentUserId, roomState } = useGame();
  const discord = useDiscord();
  const lastEmit = useRef(0);

  useEffect(() => {
    if (!socket) return;

    function onMouseMove(e: MouseEvent) {
      const now = Date.now();
      if (now - lastEmit.current < 33) return; // ~30 fps
      lastEmit.current = now;
      socket!.emit('CURSOR_MOVE', {
        x: e.clientX / window.innerWidth,
        y: e.clientY / window.innerHeight,
      });
    }

    function onTouchMove(e: TouchEvent) {
      const now = Date.now();
      if (now - lastEmit.current < 33) return;
      lastEmit.current = now;
      const t = e.touches[0];
      if (!t) return;
      socket!.emit('CURSOR_MOVE', {
        x: t.clientX / window.innerWidth,
        y: t.clientY / window.innerHeight,
      });
    }

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('touchmove', onTouchMove);
    };
  }, [socket]);

  if (!roomState || discord.status !== 'ready') return null;

  const participants = roomState.participants;
  // Build a map of userId → the item they are currently dragging
  const dragging: Record<string, (typeof roomState.items)[string]> = {};
  for (const item of Object.values(roomState.items)) {
    if (item.lockedBy && item.lockedBy !== currentUserId) {
      dragging[item.lockedBy] = item;
    }
  }

  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {Object.entries(cursors).map(([userId, { x, y }]) => {
        if (userId === currentUserId) return null;
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
            {/* Dragged item preview — floats above the cursor, out of flow */}
            {draggedItem && (
              <div className="absolute bottom-full mb-2 h-12 w-12 rounded-lg overflow-hidden border border-white/20 shadow-lg">
                {draggedItem.kind === 'text' ? (
                  <div className="h-full w-full flex items-center justify-center bg-[#1e1e2e] text-white text-[9px] font-bold text-center px-1 leading-tight">
                    {draggedItem.text}
                  </div>
                ) : (
                  <img
                    src={getItemSrc(draggedItem)}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                )}
              </div>
            )}
            {/* Arrow */}
            <svg width="12" height="16" viewBox="0 0 12 16" fill="none" className="drop-shadow">
              <path d="M0 0 L0 14 L4 10 L7 16 L9 15 L6 9 L12 9 Z" fill="white" />
              <path d="M0 0 L0 14 L4 10 L7 16 L9 15 L6 9 L12 9 Z" fill="currentColor" className="text-purple-500" fillOpacity="0.9" />
            </svg>
            {/* Avatar + name badge */}
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
