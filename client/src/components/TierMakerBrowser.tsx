import { useState } from 'react';
import { cn } from '@/lib/utils';
import { GameButton } from '@/components/ui/GameButton';
import { Gamepad2, Hourglass, CircleCheck } from 'lucide-react';

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

function proxyImg(tiermakerUrl: string) {
  return `/api/tiermaker/image?url=${encodeURIComponent(tiermakerUrl)}`;
}

async function imageUrlToBase64(imageUrl: string): Promise<string> {
  const proxyUrl = `/api/tiermaker/image?url=${encodeURIComponent(imageUrl)}`;
  const res = await fetch(proxyUrl);
  const blob = await res.blob();
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
}

interface TierMakerBrowserProps {
  /** Called with base64 items when the user confirms loading a template */
  onLoadTemplate?: (items: Array<{ dataUrl: string; fileName: string }>) => void;
  /** Called when the modal should close without loading */
  onClose?: () => void;
}

export function TierMakerBrowser({ onLoadTemplate, onClose }: TierMakerBrowserProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<Template | null>(null);
  const [searchState, setSearchState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [templateState, setTemplateState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [loadState, setLoadState] = useState<'idle' | 'loading'>('idle');
  const [searchError, setSearchError] = useState('');
  const [templateError, setTemplateError] = useState('');

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

  async function handleSelect(result: SearchResult) {
    setSelected(null);
    setTemplateState('loading');
    setTemplateError('');

    try {
      const res = await fetch(`/api/tiermaker/template?url=${encodeURIComponent(result.url)}`);
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data: Template = await res.json();
      setSelected(data);
      setTemplateState('done');
    } catch (err) {
      setTemplateError(err instanceof Error ? err.message : 'Unknown error');
      setTemplateState('error');
    }
  }

  async function handleLoad() {
    if (!selected || !onLoadTemplate) return;
    setLoadState('loading');

    try {
      const converted = await Promise.all(
        selected.items.map(async (item) => ({
          dataUrl: await imageUrlToBase64(item.imageUrl),
          fileName: `${item.id}.jpg`,
        }))
      );
      onLoadTemplate(converted);
    } finally {
      setLoadState('idle');
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-none border-b border-white/10 px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-black text-white flex items-center gap-2">
            <Gamepad2 className="text-purple-400" size={16} />
            TierMaker Templates
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
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search templates…"
            className="game-input flex-1 text-sm py-2"
          />
          <GameButton
            type="submit"
            variant="primary"
            size="sm"
            disabled={searchState === 'loading'}
          >
            {searchState === 'loading' ? '…' : 'Search'}
          </GameButton>
        </form>
      </div>

      {/* Body — results left / template right */}
      <div className="flex flex-1 overflow-hidden">
        {/* Search results panel */}
        <div className="w-56 flex-none border-r border-white/10 overflow-y-auto game-scroll">
          {searchState === 'idle' && (
            <p className="p-4 text-xs text-white/40">Enter a search term above.</p>
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
            <p className="p-4 text-xs text-white/40">No results found.</p>
          )}
          {results.map((r) => (
            <button
              key={r.url}
              onClick={() => handleSelect(r)}
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
                <p className="text-xs text-white/40">{r.imageCount} images</p>
              </div>
            </button>
          ))}
        </div>

        {/* Template detail panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {templateState === 'idle' && searchState === 'done' && (
            <p className="p-6 text-sm text-white/40">Select a template to preview.</p>
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
            <>
              <div className="flex-1 overflow-y-auto game-scroll p-4">
                <p className="text-sm font-black text-white mb-1">{selected.name}</p>
                <p className="text-xs text-white/40 mb-3">{selected.items.length} items</p>
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
              {onLoadTemplate && (
                <div className="flex-none border-t border-white/10 p-3">
                  <GameButton
                    variant="success"
                    size="md"
                    className="w-full"
                    disabled={loadState === 'loading'}
                    onClick={handleLoad}
                  >
                    {loadState === 'loading' ? (
                      <><Hourglass className="text-yellow-400 inline mr-1.5" size={14} />Converting images…</>
                    ) : (
                      <><CircleCheck className="text-green-400 inline mr-1.5" size={14} />Load {selected.items.length} Images</>
                    )}
                  </GameButton>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
