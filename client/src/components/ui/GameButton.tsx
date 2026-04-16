import { cn } from '@/lib/utils';

type Variant = 'primary' | 'success' | 'danger' | 'ghost' | 'yellow';
type Size = 'sm' | 'md' | 'lg';

interface GameButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const variantClasses: Record<Variant, string> = {
  primary:
    'bg-game-purple border-[#4c1d95] text-white hover:bg-game-purple-light',
  success:
    'bg-game-green border-[#065f46] text-white hover:brightness-110',
  danger:
    'bg-game-red border-[#991b1b] text-white hover:brightness-110',
  ghost:
    'bg-white/10 border-white/5 text-white hover:bg-white/20',
  yellow:
    'bg-game-yellow border-[#b45309] text-gray-900 hover:brightness-105',
};

const sizeClasses: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm gap-1.5',
  md: 'px-5 py-2.5 text-base gap-2',
  lg: 'px-8 py-4 text-lg gap-2.5',
};

export function GameButton({
  variant = 'primary',
  size = 'md',
  className,
  children,
  disabled,
  ...props
}: GameButtonProps) {
  return (
    <button
      disabled={disabled}
      className={cn(
        'btn-game inline-flex items-center justify-center',
        variantClasses[variant],
        sizeClasses[size],
        disabled && 'opacity-50 pointer-events-none',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
