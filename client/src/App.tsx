import { useDiscord, isInsideDiscord } from '@/context/DiscordContext';
import { TierMakerBrowser } from '@/components/TierMakerBrowser';

export default function App() {
  const discord = useDiscord();

  if (discord.status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <div className="mb-4 h-10 w-10 animate-spin rounded-full border-4 border-discord-blurple border-t-transparent mx-auto" />
          <p className="text-white/60 text-sm">
            {isInsideDiscord ? 'Connecting to Discord…' : 'Starting local dev session…'}
          </p>
        </div>
      </div>
    );
  }

  if (discord.status === 'error') {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="rounded-lg bg-discord-red/20 border border-discord-red/40 p-6 text-center max-w-sm">
          <p className="font-semibold text-discord-red mb-1">Connection error</p>
          <p className="text-sm text-white/60">{discord.error}</p>
        </div>
      </div>
    );
  }

  return <TierMakerBrowser />;
}
