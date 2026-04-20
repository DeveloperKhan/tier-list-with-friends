import { useTranslation } from 'react-i18next';
import { useDiscord, isInsideDiscord } from '@/context/DiscordContext';
import { GameProvider, useGame } from '@/context/GameContext';
import { SetupPage } from '@/pages/SetupPage';
import { WaitingPage } from '@/pages/WaitingPage';
import { PlayingPage } from '@/pages/PlayingPage';
import { Ban, TriangleAlert } from 'lucide-react';

const PREMIUM_SKU_ID = '1495582581889171467';

// ---------------------------------------------------------------------------
// Inner app — rendered inside GameProvider, can use useGame()
// ---------------------------------------------------------------------------

function GameRouter() {
  const { t } = useTranslation();
  const { roomState, isHost, rejectionReason, sessionEnded, sessionEndReason, resetSession } = useGame();
  const discord = useDiscord();

  async function handleSupportUs() {
    if (discord.status !== 'ready') return;
    try {
      await discord.discordSdk.commands.startPurchase({ sku_id: PREMIUM_SKU_ID });
    } catch {
      // User cancelled or purchase failed
    }
  }

  if (sessionEnded) {
    return (
      <div className="flex h-full items-center justify-center bg-game-bg">
        <div className="rounded-2xl border-2 border-white/10 bg-white/5 p-8 text-center max-w-sm space-y-4">
          <p className="font-black text-white text-lg">{t('app.sessionEnded')}</p>
          <p className="text-sm text-white/50">
            {sessionEndReason === 'timeout' ? t('app.sessionTimeout') : t('app.hostEndedSession')}
          </p>
          <button
            onClick={resetSession}
            className="w-full rounded-xl bg-purple-600 hover:bg-purple-500 active:scale-95 transition-all px-4 py-2 text-sm font-black text-white"
          >
            {t('app.startNewSession')}
          </button>
          <div className="relative group/tip">
            <button
              onClick={handleSupportUs}
              className="text-xs font-bold text-game-purple-light hover:text-white transition-colors px-3 py-1 rounded-lg hover:bg-white/10"
            >
              {t('app.supportButton')}
            </button>
            <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150 z-50">
              <div className="rounded-xl border border-white/15 bg-game-bg/95 backdrop-blur-sm px-3 py-2.5 text-xs text-white/80 shadow-xl">
                {t('app.supportDescription')}
              </div>
              <div className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-white/15 bg-game-bg/95" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (rejectionReason) {
    return (
      <div className="flex h-full items-center justify-center bg-game-bg">
        <div className="rounded-2xl border-2 border-game-red/40 bg-game-red/10 p-8 text-center max-w-sm">
          <Ban className="text-red-400 mb-3 mx-auto" size={40} />
          <p className="font-black text-game-red text-lg mb-1">{t('app.couldntJoin')}</p>
          <p className="text-sm text-white/60">{rejectionReason}</p>
        </div>
      </div>
    );
  }

  if (!roomState) {
    return (
      <div className="flex h-full items-center justify-center bg-game-bg">
        <div className="text-center space-y-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-game-purple border-t-transparent mx-auto" />
          <p className="text-white/50 text-sm font-semibold">{t('app.joiningRoom')}</p>
        </div>
      </div>
    );
  }

  if (roomState.phase === 'SETUP') {
    if (isHost) return <SetupPage />;
    return <WaitingPage />;
  }

  return <PlayingPage />;
}

// ---------------------------------------------------------------------------
// Root App
// ---------------------------------------------------------------------------

export default function App() {
  const { t } = useTranslation();
  const discord = useDiscord();

  if (discord.status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center bg-game-bg">
        <div className="text-center space-y-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-game-purple border-t-transparent mx-auto" />
          <p className="text-white/50 text-sm font-semibold">
            {isInsideDiscord ? t('app.connectingToDiscord') : t('app.startingDevSession')}
          </p>
        </div>
      </div>
    );
  }

  if (discord.status === 'error') {
    return (
      <div className="flex h-full items-center justify-center bg-game-bg">
        <div className="rounded-2xl border-2 border-game-red/40 bg-game-red/10 p-8 text-center max-w-sm">
          <TriangleAlert className="text-yellow-400 mb-3 mx-auto" size={40} />
          <p className="font-black text-game-red text-lg mb-1">{t('app.connectionError')}</p>
          <p className="text-sm text-white/60">{discord.error}</p>
        </div>
      </div>
    );
  }

  return (
    <GameProvider>
      <GameRouter />
    </GameProvider>
  );
}
