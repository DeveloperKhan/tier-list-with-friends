import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { Participant } from '@/context/GameContext';
import { Users, Crown } from 'lucide-react';

interface PlayerListProps {
  participants: Record<string, Participant>;
  hostId: string;
  currentUserId: string;
  className?: string;
}

function userColor(userId: string): string {
  const palette = [
    '#f472b6', '#fb923c', '#facc15', '#4ade80',
    '#22d3ee', '#818cf8', '#c084fc', '#f87171',
  ];
  let hash = 0;
  for (const ch of userId) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

function Avatar({ participant }: { participant: Participant }) {
  const initials = (participant.username ?? '?').slice(0, 2).toUpperCase();
  const bg = userColor(participant.userId);
  const avatarUrl = participant.avatar
    ? `https://cdn.discordapp.com/avatars/${participant.userId}/${participant.avatar}.png?size=64`
    : null;

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={participant.username}
        className="h-7 w-7 flex-shrink-0 rounded-full object-cover shadow-sm"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
      />
    );
  }

  return (
    <span
      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-xs font-black text-white shadow-sm"
      style={{ backgroundColor: bg }}
    >
      {initials}
    </span>
  );
}

export function PlayerList({
  participants,
  hostId,
  currentUserId,
  className,
}: PlayerListProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const playerList = Object.values(participants).sort((a, b) => {
    if (a.userId === hostId) return -1;
    if (b.userId === hostId) return 1;
    return a.username.localeCompare(b.username);
  });

  const count = playerList.length;

  return (
    <div className={cn('relative z-50', className)}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex items-center gap-2 rounded-xl border-2 border-game-border bg-game-panel/90 px-3 py-2',
          'text-sm font-bold text-white backdrop-blur-sm',
          'hover:border-game-purple/60 hover:bg-game-panel transition-colors',
        )}
      >
        <Users className="text-blue-400" size={16} />
        <span>{count}</span>
        <span
          className={cn(
            'text-white/50 transition-transform duration-200',
            open && 'rotate-180',
          )}
        >
          ▾
        </span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 animate-bounce-in overflow-hidden rounded-2xl border-2 border-game-border bg-game-panel shadow-2xl">
          <div className="border-b border-white/10 px-4 py-2.5">
            <p className="text-xs font-black uppercase tracking-wider text-game-purple-light">
              {t('playerList.playersInSession')}
            </p>
          </div>
          <ul className="max-h-64 overflow-y-auto game-scroll py-2">
            {playerList.map((p) => (
              <li
                key={p.userId}
                className="flex items-center gap-3 px-3 py-2 hover:bg-white/5"
              >
                <Avatar participant={p} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-white">
                    {p.username}
                    {p.userId === currentUserId && (
                      <span className="ml-1 text-xs font-normal text-white/40">{t('playerList.you')}</span>
                    )}
                  </p>
                </div>
                {p.userId === hostId && (
                  <span title={t('playerList.hostTitle')} className="flex-shrink-0">
                    <Crown className="text-yellow-400" size={16} />
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
