import { useDiscord, isInsideDiscord } from '@/context/DiscordContext';
import { GameProvider, useGame } from '@/context/GameContext';
import { SetupPage } from '@/pages/SetupPage';
import { WaitingPage } from '@/pages/WaitingPage';

// ---------------------------------------------------------------------------
// Inner app — rendered inside GameProvider, can use useGame()
// ---------------------------------------------------------------------------

function GameRouter() {
  const { roomState, isHost, rejectionReason } = useGame();

  if (rejectionReason) {
    return (
      <div className="flex h-full items-center justify-center bg-game-bg">
        <div className="rounded-2xl border-2 border-game-red/40 bg-game-red/10 p-8 text-center max-w-sm">
          <p className="text-4xl mb-3">🚫</p>
          <p className="font-black text-game-red text-lg mb-1">Couldn't join</p>
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
          <p className="text-white/50 text-sm font-semibold">Joining room…</p>
        </div>
      </div>
    );
  }

  // SETUP phase
  if (roomState.phase === 'SETUP') {
    // Host sees the full setup controls; non-hosts see the same page but with
    // edit controls hidden (SetupPage handles this internally via isHost).
    // The non-host view shows tier list state + "Waiting for host" at the bottom.
    if (isHost) return <SetupPage />;
    return <WaitingPage />;
  }

  // PLAYING phase — placeholder until the game board is built
  return (
    <div className="flex h-full items-center justify-center bg-game-bg">
      <p className="text-white/50 font-bold">🎮 Game board coming soon…</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root App
// ---------------------------------------------------------------------------

export default function App() {
  const discord = useDiscord();

  if (discord.status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center bg-game-bg">
        <div className="text-center space-y-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-game-purple border-t-transparent mx-auto" />
          <p className="text-white/50 text-sm font-semibold">
            {isInsideDiscord ? 'Connecting to Discord…' : 'Starting dev session…'}
          </p>
        </div>
      </div>
    );
  }

  if (discord.status === 'error') {
    return (
      <div className="flex h-full items-center justify-center bg-game-bg">
        <div className="rounded-2xl border-2 border-game-red/40 bg-game-red/10 p-8 text-center max-w-sm">
          <p className="text-4xl mb-3">⚠️</p>
          <p className="font-black text-game-red text-lg mb-1">Connection error</p>
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
