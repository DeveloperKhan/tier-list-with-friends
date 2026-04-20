import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { discordAvatarUrl } from '@/lib/utils';
import type { DuelResult, Participant } from '@/context/GameContext';
import { Z } from '@/lib/constants';

const MOVES = ['rock', 'paper', 'scissors'] as const;
const MOVE_EMOJI: Record<string, string> = { rock: '🪨', paper: '📄', scissors: '✂️' };

type Phase = 'spinning' | 'revealed';

interface Props {
  result: DuelResult;
  participants: Record<string, Participant>;
  currentUserId: string;
  onDone: () => void;
}

export function DuelCutscene({ result, participants, currentUserId, onDone }: Props) {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>('spinning');
  const [spinIdx, setSpinIdx] = useState(0);

  const MOVE_LABEL: Record<string, string> = {
    rock: t('duel.rock'),
    paper: t('duel.paper'),
    scissors: t('duel.scissors'),
  };

  useEffect(() => {
    let frame = 0;
    const spin = setInterval(() => {
      frame++;
      setSpinIdx((i) => (i + 1) % 3);
    }, 120);

    const revealTimer = setTimeout(() => {
      clearInterval(spin);
      setPhase('revealed');
    }, 1600);

    const doneTimer = setTimeout(() => {
      onDone();
    }, 4800);

    return () => {
      clearInterval(spin);
      clearTimeout(revealTimer);
      clearTimeout(doneTimer);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const challenger = participants[result.challengerId];
  const owner = participants[result.ownerId];
  const challengerWon = result.winnerId === result.challengerId;
  const isChallenger = currentUserId === result.challengerId;
  const isOwner = currentUserId === result.ownerId;
  const iInvolved = isChallenger || isOwner;

  const resultLabel = iInvolved
    ? result.winnerId === currentUserId ? t('duel.youWin') : t('duel.youLose')
    : t('duel.someoneWins', { name: participants[result.winnerId]?.username ?? 'Someone' });

  function MoveSlot({ move, spinning, offset = 0 }: { move: string; spinning: boolean; offset?: number }) {
    const displayIdx = (spinIdx + offset) % 3;
    return (
      <div className="flex flex-col items-center gap-1">
        <div
          className={cn(
            'text-4xl w-14 h-14 flex items-center justify-center rounded-xl bg-white/10 border border-white/20 transition-all duration-150',
            !spinning && 'bg-white/20 scale-110',
          )}
        >
          {spinning ? MOVE_EMOJI[MOVES[displayIdx]] : MOVE_EMOJI[move]}
        </div>
        {!spinning && (
          <span className="text-white/60 text-[10px] font-semibold">{MOVE_LABEL[move]}</span>
        )}
      </div>
    );
  }

  function PlayerSide({
    userId,
    participant,
    move,
    won,
  }: {
    userId: string;
    participant: Participant | undefined;
    move: string;
    won: boolean;
  }) {
    return (
      <div className={cn('flex flex-col items-center gap-2', won && phase === 'revealed' && 'opacity-100', !won && phase === 'revealed' && 'opacity-50')}>
        <img
          src={discordAvatarUrl(userId, participant?.avatar ?? null)}
          alt={participant?.username}
          className={cn('h-9 w-9 rounded-full border-2', won && phase === 'revealed' ? 'border-yellow-400' : 'border-white/20')}
        />
        <p className="text-white/70 text-[10px] font-semibold max-w-[64px] truncate text-center">
          {participant?.username ?? '…'}
        </p>
        <MoveSlot move={move} spinning={phase === 'spinning'} offset={userId === result.ownerId ? 1 : 0} />
      </div>
    );
  }

  return (
    <div style={{ zIndex: Z.duelCutscene }} className="fixed inset-0 flex items-center justify-center pointer-events-none">
      <div className="pointer-events-auto animate-bounce-in bg-game-bg border-2 border-purple-500/60 rounded-2xl p-5 shadow-2xl w-72 text-center backdrop-blur-sm">
        <p className="text-white font-black text-sm mb-4 tracking-wide">{t('duel.duelTitle')}</p>

        <div className="flex items-center justify-around">
          <PlayerSide
            userId={result.challengerId}
            participant={challenger}
            move={result.challengerMove}
            won={challengerWon}
          />
          <div className="flex flex-col items-center gap-1">
            <span className="text-white/40 font-black text-lg">{t('duel.vs')}</span>
          </div>
          <PlayerSide
            userId={result.ownerId}
            participant={owner}
            move={result.ownerMove}
            won={!challengerWon}
          />
        </div>

        <div
          className={cn(
            'mt-4 py-2 rounded-xl font-black text-sm transition-all duration-300',
            phase === 'spinning' && 'opacity-0',
            phase === 'revealed' && 'opacity-100',
            challengerWon ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400',
          )}
        >
          {resultLabel}
        </div>

        {phase === 'revealed' && (
          <button
            onClick={onDone}
            className="mt-3 text-white/40 hover:text-white/70 text-xs transition-colors"
          >
            {t('duel.close')}
          </button>
        )}
      </div>
    </div>
  );
}
