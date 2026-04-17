const BG_SQUARES = [
  { left: '2%',  size: 32, color: 'rgba(124,58,237,0.45)',  opacity: 0.45, dur: '14s', delay: '0s'   },
  { left: '6%',  size: 18, color: 'rgba(251,191,36,0.4)',   opacity: 0.40, dur: '9s',  delay: '-3s'  },
  { left: '9%',  size: 80, color: 'rgba(251,191,36,0.28)',  opacity: 0.28, dur: '26s', delay: '-19s' },
  { left: '12%', size: 16, color: 'rgba(6,182,212,0.5)',    opacity: 0.50, dur: '10s', delay: '-4s'  },
  { left: '15%', size: 10, color: 'rgba(124,58,237,0.55)',  opacity: 0.55, dur: '6s',  delay: '-8s'  },
  { left: '18%', size: 44, color: 'rgba(34,197,94,0.35)',   opacity: 0.35, dur: '17s', delay: '-12s' },
  { left: '21%', size: 22, color: 'rgba(236,72,153,0.42)',  opacity: 0.42, dur: '8s',  delay: '-21s' },
  { left: '24%', size: 52, color: 'rgba(236,72,153,0.38)',  opacity: 0.38, dur: '18s', delay: '-8s'  },
  { left: '27%', size: 14, color: 'rgba(99,102,241,0.5)',   opacity: 0.50, dur: '7s',  delay: '-16s' },
  { left: '30%', size: 20, color: 'rgba(99,102,241,0.45)',  opacity: 0.45, dur: '11s', delay: '-5s'  },
  { left: '33%', size: 24, color: 'rgba(34,197,94,0.42)',   opacity: 0.42, dur: '12s', delay: '-2s'  },
  { left: '36%', size: 60, color: 'rgba(124,58,237,0.3)',   opacity: 0.30, dur: '21s', delay: '-25s' },
  { left: '39%', size: 36, color: 'rgba(236,72,153,0.36)',  opacity: 0.36, dur: '15s', delay: '-6s'  },
  { left: '42%', size: 14, color: 'rgba(6,182,212,0.5)',    opacity: 0.50, dur: '6s',  delay: '-22s' },
  { left: '45%', size: 68, color: 'rgba(99,102,241,0.32)',  opacity: 0.32, dur: '22s', delay: '-11s' },
  { left: '48%', size: 22, color: 'rgba(124,58,237,0.48)',  opacity: 0.48, dur: '8s',  delay: '-15s' },
  { left: '51%', size: 50, color: 'rgba(34,197,94,0.3)',    opacity: 0.30, dur: '19s', delay: '-24s' },
  { left: '54%', size: 20, color: 'rgba(251,191,36,0.42)',  opacity: 0.42, dur: '9s',  delay: '-5s'  },
  { left: '57%', size: 12, color: 'rgba(99,102,241,0.5)',   opacity: 0.50, dur: '7s',  delay: '-9s'  },
  { left: '60%', size: 38, color: 'rgba(251,191,36,0.35)',  opacity: 0.35, dur: '13s', delay: '-17s' },
  { left: '63%', size: 44, color: 'rgba(6,182,212,0.38)',   opacity: 0.38, dur: '16s', delay: '-3s'  },
  { left: '66%', size: 16, color: 'rgba(236,72,153,0.5)',   opacity: 0.50, dur: '8s',  delay: '-27s' },
  { left: '69%', size: 90, color: 'rgba(99,102,241,0.25)',  opacity: 0.25, dur: '28s', delay: '-16s' },
  { left: '72%', size: 28, color: 'rgba(236,72,153,0.46)',  opacity: 0.46, dur: '11s', delay: '-7s'  },
  { left: '75%', size: 18, color: 'rgba(34,197,94,0.44)',   opacity: 0.44, dur: '7s',  delay: '-30s' },
  { left: '78%', size: 14, color: 'rgba(6,182,212,0.48)',   opacity: 0.48, dur: '11s', delay: '-13s' },
  { left: '81%', size: 60, color: 'rgba(124,58,237,0.32)',  opacity: 0.32, dur: '20s', delay: '-14s' },
  { left: '84%', size: 24, color: 'rgba(251,191,36,0.4)',   opacity: 0.40, dur: '10s', delay: '-20s' },
  { left: '87%', size: 18, color: 'rgba(34,197,94,0.44)',   opacity: 0.44, dur: '8s',  delay: '-1s'  },
  { left: '90%', size: 42, color: 'rgba(236,72,153,0.36)',  opacity: 0.36, dur: '15s', delay: '-10s' },
  { left: '93%', size: 12, color: 'rgba(6,182,212,0.52)',   opacity: 0.52, dur: '6s',  delay: '-18s' },
  { left: '96%', size: 56, color: 'rgba(99,102,241,0.3)',   opacity: 0.30, dur: '23s', delay: '-23s' },
];

export function SetupBackground() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {BG_SQUARES.map((s, i) => (
        <div
          key={i}
          className="setup-bg-square"
          style={{
            left: s.left,
            width: s.size,
            height: s.size,
            background: s.color,
            animationDuration: s.dur,
            animationDelay: s.delay,
            ['--sq-opacity' as string]: s.opacity,
          }}
        />
      ))}
    </div>
  );
}
