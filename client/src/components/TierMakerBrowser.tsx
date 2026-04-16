import { useState } from 'react';
import { cn } from '@/lib/utils';

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

export function TierMakerBrowser() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<Template | null>(null);
  const [searchState, setSearchState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [templateState, setTemplateState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [searchError, setSearchError] = useState('');
  const [templateError, setTemplateError] = useState('');

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;

    setSearchState('loading');
    setResults([]);
    setSelected(null);
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

  return (
    <div className="flex h-full flex-col bg-[#23272a] text-white overflow-hidden">
      {/* Header */}
      <div className="flex-none border-b border-white/10 px-6 py-4">
        <h1 className="text-lg font-semibold text-white">TierMaker Browser <span className="text-xs font-normal text-white/40 ml-2">API test</span></h1>
        <form onSubmit={handleSearch} className="mt-3 flex gap-2">
          <input
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search TierMaker templates…"
            className="flex-1 rounded-md bg-white/10 px-3 py-2 text-sm text-white placeholder:text-white/40 outline-none focus:ring-2 focus:ring-[#5865F2]"
          />
          <button
            type="submit"
            disabled={searchState === 'loading'}
            className="rounded-md bg-[#5865F2] px-4 py-2 text-sm font-medium text-white disabled:opacity-50 hover:bg-[#4752c4] transition-colors"
          >
            {searchState === 'loading' ? 'Searching…' : 'Search'}
          </button>
        </form>
      </div>

      {/* Body — split: results left, template right */}
      <div className="flex flex-1 overflow-hidden">

        {/* Search results panel */}
        <div className="w-72 flex-none border-r border-white/10 overflow-y-auto">
          {searchState === 'idle' && (
            <p className="p-4 text-sm text-white/40">Enter a search term above.</p>
          )}
          {searchState === 'error' && (
            <p className="p-4 text-sm text-red-400">{searchError}</p>
          )}
          {searchState === 'loading' && (
            <div className="flex justify-center py-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#5865F2] border-t-transparent" />
            </div>
          )}
          {searchState === 'done' && results.length === 0 && (
            <p className="p-4 text-sm text-white/40">No results found.</p>
          )}
          {results.map(r => (
            <button
              key={r.url}
              onClick={() => handleSelect(r)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-white/5 transition-colors border-b border-white/5',
                templateState === 'loading' && 'pointer-events-none opacity-60',
              )}
            >
              {r.thumbnailUrl ? (
                <img
                  src={proxyImg(r.thumbnailUrl)}
                  alt={r.name}
                  className="h-12 w-12 rounded object-cover flex-none bg-white/10"
                />
              ) : (
                <div className="h-12 w-12 rounded bg-white/10 flex-none" />
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-white">{r.name}</p>
                <p className="text-xs text-white/40">{r.imageCount} images</p>
              </div>
            </button>
          ))}
        </div>

        {/* Template detail panel */}
        <div className="flex-1 overflow-y-auto">
          {templateState === 'idle' && searchState === 'done' && (
            <p className="p-6 text-sm text-white/40">Select a template to preview its images.</p>
          )}
          {templateState === 'loading' && (
            <div className="flex justify-center py-12">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#5865F2] border-t-transparent" />
            </div>
          )}
          {templateState === 'error' && (
            <p className="p-6 text-sm text-red-400">{templateError}</p>
          )}
          {templateState === 'done' && selected && (
            <div className="p-6">
              <h2 className="text-xl font-bold text-white mb-1">{selected.name}</h2>
              <p className="text-sm text-white/40 mb-4">{selected.items.length} items</p>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-2">
                {selected.items.map(item => (
                  <div key={item.id} className="aspect-square rounded overflow-hidden bg-white/10">
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
          )}
        </div>
      </div>
    </div>
  );
}
