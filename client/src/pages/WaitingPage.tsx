import { useTranslation } from 'react-i18next';
import { trackSupportClicked } from '@/lib/analytics';
import { useGame } from '@/context/GameContext';
import { useDiscord } from '@/context/DiscordContext';
import { PlayerList } from '@/components/ui/PlayerList';
import { LanguageSelector } from '@/components/ui/LanguageSelector';
import { Panel } from '@/components/ui/Panel';
import { SetupBackground } from '@/components/ui/SetupBackground';
import { Hourglass, Crown } from 'lucide-react';
import logoUrl from '/assets/square-logo.svg';
import { Z } from '@/lib/constants';

const PREMIUM_SKU_ID = '1495582581889171467';

export function WaitingPage() {
  const { t } = useTranslation();
  const { roomState, currentUserId } = useGame();
  const discord = useDiscord();

  async function handleSupportUs() {
    if (discord.status !== 'ready') return;
    trackSupportClicked({ page: 'waiting' });
    try {
      await discord.discordSdk.commands.startPurchase({ sku_id: PREMIUM_SKU_ID });
    } catch {
      // User cancelled or purchase failed
    }
  }

  if (!roomState) return null;

  const loadingMessages = t('waiting.loadingMessages', { returnObjects: true }) as string[];
  const msgIndex = roomState.instanceId
    ? Math.abs(
        [...roomState.instanceId].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)
      ) % loadingMessages.length
    : 0;
  const message = loadingMessages[msgIndex];

  const hostParticipant = roomState.participants[roomState.hostId];
  const hostName = hostParticipant?.username ?? 'the host';

  return (
    <div className="relative flex h-full flex-col bg-game-bg overflow-hidden">
      <SetupBackground />
      <div
        className="w-full bg-gradient-to-r from-game-pink via-game-purple to-game-cyan flex-none"
        style={{ height: 'calc(4px + env(safe-area-inset-top))' }}
      />

      <header className="flex-none flex items-center justify-between px-5 py-3 border-b border-white/10 bg-game-bg/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <img src={logoUrl} alt="Logo" className="h-8 w-8 rounded-lg" />
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-game-purple-light">{t('waiting.lobbyHeading')}</p>
            <h1 className="text-lg font-black text-white leading-tight">{t('waiting.title')}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <LanguageSelector />
          <PlayerList
            participants={roomState.participants}
            hostId={roomState.hostId}
            currentUserId={currentUserId}
          />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-6 py-8">
        <div className="text-center max-w-sm space-y-6">
          <div className="flex justify-center">
            <Hourglass className="animate-float text-game-purple" size={80} />
          </div>

          <div className="space-y-2">
            <h2 className="text-2xl font-black text-white">
              {t('waiting.settingUpGame')}
            </h2>
            <p className="text-sm font-semibold text-white/50 leading-relaxed">
              {message}
            </p>
          </div>

          <Panel className="px-5 py-3 inline-flex items-center gap-3 mx-auto">
            <Crown className="text-yellow-400" size={20} />
            <div className="text-left">
              <p className="text-xs text-white/40 font-bold uppercase tracking-wide">{t('waiting.hostLabel')}</p>
              <p className="text-sm font-black text-white">{hostName}</p>
            </div>
          </Panel>

          <div className="flex justify-center gap-2">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="h-2.5 w-2.5 rounded-full bg-game-purple animate-pulse2"
                style={{ animationDelay: `${i * 0.3}s` }}
              />
            ))}
          </div>

          {!roomState?.isPremium && (
            <div className="relative group/tip inline-block">
              <button
                onClick={handleSupportUs}
                className="text-xs font-bold text-game-purple-light hover:text-white transition-colors px-3 py-1 rounded-lg hover:bg-white/10"
              >
                {t('waiting.supportButton')}
              </button>
              <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 opacity-0 group-hover/tip:opacity-100 transition-opacity duration-150" style={{ zIndex: Z.modal }}>
                <div className="rounded-xl border border-white/15 bg-game-bg/95 backdrop-blur-sm px-3 py-2.5 text-xs text-white/80 shadow-xl">
                  {t('waiting.supportDescription')}
                </div>
                <div className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-r border-white/15 bg-game-bg/95" />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
