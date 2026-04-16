---
name: discord-participants
description: Add participant tracking to show who is in the activity (Discord voice channel members)
---

Add real-time participant tracking using the Discord Embedded App SDK. Participants are the Discord users currently in the same voice channel running this activity.

## Pattern

```tsx
import { useState, useEffect } from 'react';
import { useDiscord } from '@/context/DiscordContext';

type Participant = {
  id: string;
  username: string;
  avatar: string | null;
  global_name: string | null;
};

export function useParticipants() {
  const discord = useDiscord();
  const [participants, setParticipants] = useState<Participant[]>([]);

  useEffect(() => {
    if (discord.status !== 'ready') return;
    const { discordSdk } = discord;

    async function load() {
      const { participants } = await discordSdk.commands.getInstanceConnectedParticipants();
      setParticipants(participants as Participant[]);
    }

    discordSdk.subscribe(
      'ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE',
      ({ participants }) => setParticipants(participants as Participant[]),
    );

    load();

    return () => {
      discordSdk.unsubscribe('ACTIVITY_INSTANCE_PARTICIPANTS_UPDATE', () => {});
    };
  }, [discord.status]);

  return participants;
}
```

## Displaying avatars

```tsx
function avatarUrl(userId: string, avatarHash: string | null) {
  if (!avatarHash) return `https://cdn.discordapp.com/embed/avatars/${parseInt(userId) % 5}.png`;
  return `https://cdn.discordapp.com/avatars/${userId}/${avatarHash}.png?size=64`;
}

function ParticipantAvatar({ p }: { p: Participant }) {
  return (
    <img
      src={avatarUrl(p.id, p.avatar)}
      alt={p.global_name ?? p.username}
      className="h-8 w-8 rounded-full ring-2 ring-discord-blurple"
    />
  );
}
```

## Rules
- Keep `discordSdk` calls inside effects — the SDK is async and not safe during render
- Unsubscribe on cleanup to avoid memory leaks
- Max ~25 participants expected in a voice channel — no pagination needed
- Map participant IDs to tier list votes/rankings server-side to attribute actions to users

Now add participant tracking to the component or hook the user described.
