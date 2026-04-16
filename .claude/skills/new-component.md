---
name: new-component
description: Scaffold a new Discord-aware React component for the tier list activity
---

Create a new React component for this Discord activity project. Follow these rules:

**File location:** `client/src/components/<ComponentName>.tsx`

**Template to follow:**

```tsx
import { cn } from '@/lib/utils';
// Add other imports as needed

interface Props {
  // Define props here
}

export function ComponentName({ }: Props) {
  return (
    <div className={cn('...')}>
      {/* component content */}
    </div>
  );
}
```

**If the component needs Discord user/SDK access**, import and call `useDiscord()`:

```tsx
import { useDiscord } from '@/context/DiscordContext';

export function ComponentName() {
  const discord = useDiscord();
  if (discord.status !== 'ready') return null;

  const { user, discordSdk } = discord;
  // use discordSdk.commands.* here
}
```

**Rules:**
- Always use the `cn()` helper from `@/lib/utils` for conditional Tailwind classes
- Export as a named export (not default)
- Use Tailwind utility classes for all styling — reference Discord colors via `discord-blurple`, `discord-red`, etc.
- Keep components focused: one responsibility per file
- Do not create a new DiscordSDK instance — always get it from `useDiscord()`

Now create the component the user described, filling in the appropriate props, JSX, and logic.
