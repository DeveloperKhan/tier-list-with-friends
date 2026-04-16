import { cn } from '@/lib/utils';

interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Applies a colored left border accent */
  accent?: string;
}

export function Panel({ className, accent, style, children, ...props }: PanelProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border-2 border-game-border bg-game-panel/80 backdrop-blur-sm',
        className,
      )}
      style={{
        borderLeftColor: accent ?? undefined,
        borderLeftWidth: accent ? '4px' : undefined,
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  );
}

/** A section label with cartoonish styling */
export function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn('text-xs font-black uppercase tracking-widest text-game-purple-light', className)}>
      {children}
    </p>
  );
}
