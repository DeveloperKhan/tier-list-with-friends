import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { GameButton } from '@/components/ui/GameButton';
import { Gamepad2, CircleCheck, Link, Search } from 'lucide-react';

type SearchResult = {
  url: string;
  name: string;
  thumbnailUrl: string | null;
  imageCount: number;
};

type TemplateItem = {
  id: string;
  imageUrl: string;
};

type Template = {
  name: string;
  items: TemplateItem[];
};

type Mode = 'url' | 'explore';

function proxyImg(tiermakerUrl: string) {
  if (!tiermakerUrl) return '';
  const url = tiermakerUrl.startsWith('/')
    ? `https://tiermaker.com${tiermakerUrl}`
    : tiermakerUrl;
  return `/api/tiermaker/image?url=${encodeURIComponent(url)}`;
}

function validateTierMakerUrl(value: string, t: (key: string) => string): string | null {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    return t('tierMakerBrowser.invalidUrlError');
  }
  if (u.hostname !== 'tiermaker.com') {
    return t('tierMakerBrowser.wrongDomainError');
  }
  if (!u.pathname.startsWith('/create/')) {
    return t('tierMakerBrowser.unsupportedUrlError');
  }
  return null;
}

export type TierMakerTemplateItem = {
  kind: 'tiermaker';
  imageUrl: string;
  fileName: string;
};

interface TierMakerBrowserProps {
  onLoadTemplate?: (items: TierMakerTemplateItem[]) => void;
  onClose?: () => void;
}

export function TierMakerBrowser({ onLoadTemplate, onClose }: TierMakerBrowserProps) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('url');

  // URL mode state
  const [urlInput, setUrlInput] = useState('');
  const [urlError, setUrlError] = useState('');

  // Explore mode state
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchState, setSearchState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [searchError, setSearchError] = useState('');

  // Shared template state
  const [selected, setSelected] = useState<Template | null>(null);
  const [templateState, setTemplateState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [templateError, setTemplateError] = useState('');

  async function loadTemplate(url: string) {
    setSelected(null);
    setTemplateState('loading');
    setTemplateError('');
    try {
      const res = await fetch(`/api/tiermaker/template?url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data: Template = await res.json();
      setSelected(data);
      setTemplateState('done');
    } catch (err) {
      setTemplateError(err instanceof Error ? err.message : 'Unknown error');
      setTemplateState('error');
    }
  }

  async function handleUrlLoad(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = urlInput.trim();
    if (!trimmed) return;
    const validationError = validateTierMakerUrl(trimmed, t);
    if (validationError) {
      setUrlError(validationError);
      return;
    }
    setUrlError('');
    await loadTemplate(trimmed);
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearchState('loading');
    setResults([]);
    setSelected(null);
    setTemplateState('idle');
    setSearchError('');
    try {
      const res = await fetch(`/api/tiermaker/search?q=${encodeURIComponent(query)}`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data: SearchResult[] = await res.json();
      setResults(data);
      setSearchState('done');
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Unknown error');
      setSearchState('error');
    }
  }

  function handleLoad() {
    if (!selected || !onLoadTemplate) return;
    const items: TierMakerTemplateItem[] = selected.items.slice(0, 300).map((item) => ({
      kind: 'tiermaker',
      imageUrl: item.imageUrl,
      fileName: `${item.id}.jpg`,
    }));
    onLoadTemplate(items);
  }

  function switchMode(next: Mode) {
    setMode(next);
    setSelected(null);
    setTemplateState('idle');
    setTemplateError('');
    if (next === 'url') {
      setUrlError('');
    } else {
      setResults([]);
      setSearchState('idle');
      setSearchError('');
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-none border-b border-white/10 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-black text-white flex items-center gap-2">
            <Gamepad2 className="text-purple-400" size={16} />
            {t('tierMakerBrowser.title')}
          </h2>
          {onClose && (
            <button
              onClick={onClose}
              className="text-white/40 hover:text-white transition-colors text-xl leading-none"
            >
              ✕
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-3">
          <button
            onClick={() => switchMode('url')}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors',
              mode === 'url'
                ? 'bg-game-purple text-white'
                : 'text-white/50 hover:text-white/80',
            )}
          >
            <Link size={12} />
            {t('tierMakerBrowser.pasteUrlTab')}
          </button>
          {/* <button
            onClick={() => switchMode('explore')}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors',
              mode === 'explore'
                ? 'bg-game-purple text-white'
                : 'text-white/50 hover:text-white/80',
            )}
          >
            <Search size={12} />
            {t('tierMakerBrowser.exploreTab')}
          </button> */}
        </div>

        {/* URL input */}
        {mode === 'url' && (
          <form onSubmit={handleUrlLoad} className="flex flex-col gap-1.5">
            <div className="flex gap-2">
              <input
                type="text"
                value={urlInput}
                onChange={(e) => { setUrlInput(e.target.value); setUrlError(''); }}
                placeholder={t('tierMakerBrowser.urlPlaceholder')}
                className="game-input flex-1 text-sm py-2"
              />
              <GameButton
                type="submit"
                variant="primary"
                size="sm"
                disabled={templateState === 'loading'}
              >
                {templateState === 'loading' ? t('tierMakerBrowser.loadingEllipsis') : t('tierMakerBrowser.loadButton')}
              </GameButton>
            </div>
            {urlError
              ? <p className="text-xs text-game-red">{urlError}</p>
              : <p className="text-xs text-white/30">{t('tierMakerBrowser.pasteUrlHint')}</p>
            }
          </form>
        )}

        {/* Search input */}
        {mode === 'explore' && (
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('tierMakerBrowser.searchPlaceholder')}
              className="game-input flex-1 text-sm py-2"
            />
            <GameButton
              type="submit"
              variant="primary"
              size="sm"
              disabled={searchState === 'loading'}
            >
              {searchState === 'loading' ? t('tierMakerBrowser.loadingEllipsis') : t('tierMakerBrowser.searchButton')}
            </GameButton>
          </form>
        )}
      </div>

      {/* Body */}
      {mode === 'url' ? (
        // URL mode — full-width template preview
        <div className="flex-1 flex flex-col overflow-hidden">
          {templateState === 'idle' && (
            <p className="p-6 text-sm text-white/40">
              {t('tierMakerBrowser.pasteUrlPrompt')}
            </p>
          )}
          {templateState === 'loading' && (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-game-purple border-t-transparent" />
            </div>
          )}
          {templateState === 'error' && (
            <p className="p-6 text-sm text-game-red">{templateError}</p>
          )}
          {templateState === 'done' && selected && (
            <TemplatePreview selected={selected} onLoad={onLoadTemplate ? handleLoad : undefined} />
          )}
        </div>
      ) : (
        // Explore mode — results left / template right
        <div className="flex flex-1 overflow-hidden">
          <div className="w-56 flex-none border-r border-white/10 overflow-y-auto game-scroll">
            {searchState === 'idle' && (
              <p className="p-4 text-xs text-white/40">{t('tierMakerBrowser.enterSearchPrompt')}</p>
            )}
            {searchState === 'error' && (
              <p className="p-4 text-xs text-game-red">{searchError}</p>
            )}
            {searchState === 'loading' && (
              <div className="flex justify-center py-8">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-game-purple border-t-transparent" />
              </div>
            )}
            {searchState === 'done' && results.length === 0 && (
              <p className="p-4 text-xs text-white/40">{t('tierMakerBrowser.noResults')}</p>
            )}
            {results.map((r) => (
              <button
                key={r.url}
                onClick={() => loadTemplate(r.url)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-white/5 transition-colors border-b border-white/5',
                  templateState === 'loading' && 'pointer-events-none opacity-60',
                )}
              >
                {r.thumbnailUrl ? (
                  <img
                    src={proxyImg(r.thumbnailUrl)}
                    alt={r.name}
                    className="h-10 w-10 rounded-lg object-cover flex-none bg-white/10"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-lg bg-white/10 flex-none" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-white">{r.name}</p>
                  <p className="text-xs text-white/40">{t('tierMakerBrowser.imageCount', { count: r.imageCount })}</p>
                </div>
              </button>
            ))}
          </div>

          <div className="flex-1 flex flex-col overflow-hidden">
            {templateState === 'idle' && searchState === 'done' && (
              <p className="p-6 text-sm text-white/40">{t('tierMakerBrowser.selectTemplatePrompt')}</p>
            )}
            {templateState === 'loading' && (
              <div className="flex justify-center py-12">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-game-purple border-t-transparent" />
              </div>
            )}
            {templateState === 'error' && (
              <p className="p-6 text-sm text-game-red">{templateError}</p>
            )}
            {templateState === 'done' && selected && (
              <TemplatePreview selected={selected} onLoad={onLoadTemplate ? handleLoad : undefined} />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function TemplatePreview({
  selected,
  onLoad,
}: {
  selected: Template;
  onLoad?: () => void;
}) {
  const { t } = useTranslation();

  function proxyImg(tiermakerUrl: string) {
    if (!tiermakerUrl) return '';
    const url = tiermakerUrl.startsWith('/')
      ? `https://tiermaker.com${tiermakerUrl}`
      : tiermakerUrl;
    return `/api/tiermaker/image?url=${encodeURIComponent(url)}`;
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto game-scroll p-4">
        <p className="text-sm font-black text-white mb-1">{selected.name}</p>
        <p className="text-xs text-white/40 mb-3">{t('tierMakerBrowser.itemCount', { count: selected.items.length })}</p>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(64px,1fr))] gap-1.5">
          {selected.items.map((item) => (
            <div
              key={item.id}
              className="aspect-square rounded-lg overflow-hidden bg-white/10"
            >
              <img
                src={proxyImg(item.imageUrl)}
                alt={`item ${item.id}`}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </div>
          ))}
        </div>
      </div>
      {onLoad && (
        <div className="flex-none border-t border-white/10 p-3">
          <GameButton
            variant="success"
            size="md"
            className="w-full"
            onClick={onLoad}
          >
            <CircleCheck className="text-green-400 inline mr-1.5" size={14} />
            {t('tierMakerBrowser.loadImages', { count: selected.items.length })}
          </GameButton>
        </div>
      )}
    </>
  );
}
