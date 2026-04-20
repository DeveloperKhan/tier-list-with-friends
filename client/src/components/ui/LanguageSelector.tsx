import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

const LANGUAGES = [
  { code: 'en', flag: '🇬🇧' },
  { code: 'ja', flag: '🇯🇵' },
  { code: 'es', flag: '🇪🇸' },
  { code: 'pt', flag: '🇧🇷' },
  { code: 'zh', flag: '🇨🇳' },
  { code: 'vi', flag: '🇻🇳' },
] as const;

type LangCode = typeof LANGUAGES[number]['code'];

export function LanguageSelector() {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);

  const current = LANGUAGES.find(l => l.code === i18n.language) ?? LANGUAGES[0];

  function select(code: LangCode) {
    i18n.changeLanguage(code);
    localStorage.setItem('language', code);
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-center h-8 w-8 rounded-xl border-2 border-game-border bg-game-panel/90 text-base hover:border-game-purple/60 transition-colors backdrop-blur-sm"
        aria-label={t('language.' + current.code as `language.${LangCode}`)}
      >
        {current.flag}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 min-w-[9rem] animate-bounce-in overflow-hidden rounded-2xl border-2 border-game-border bg-game-panel shadow-2xl">
            {LANGUAGES.map(lang => (
              <button
                key={lang.code}
                onClick={() => select(lang.code)}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2.5 text-sm font-bold transition-colors hover:bg-white/5',
                  i18n.language === lang.code ? 'text-white' : 'text-white/50',
                )}
              >
                <span className="text-base leading-none">{lang.flag}</span>
                <span>{t(`language.${lang.code}` as `language.${LangCode}`)}</span>
                {i18n.language === lang.code && (
                  <span className="ml-auto text-game-purple-light text-xs">✓</span>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
