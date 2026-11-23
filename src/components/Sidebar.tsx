import React, { useEffect, useRef, useState } from 'react';
import {
  Activity,
  BookOpen,
  Compass,
  MapPin,
  Megaphone,
  MessageSquare,
  Search,
  Wind,
  X,
} from 'lucide-react';
import type { CityLocation } from '../../shared/types';

export type NavSection = 'dashboard' | 'map' | 'assistant' | 'reports' | 'methodology';

interface SidebarProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  curatedLocations: CityLocation[];
  selectedLocation: CityLocation;
  onSelectLocation: (loc: CityLocation) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: Array<{
  id: NavSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'dashboard', label: 'Live Dashboard', icon: Activity },
  { id: 'map', label: 'Pollution Map', icon: Compass },
  { id: 'assistant', label: 'AI Assistant', icon: MessageSquare },
  { id: 'reports', label: 'Community Reports', icon: Megaphone },
  { id: 'methodology', label: 'Data & Standards', icon: BookOpen },
];

export function Sidebar({
  activeSection,
  onSelectSection,
  curatedLocations,
  selectedLocation,
  onSelectLocation,
  mobileOpen,
  onCloseMobile,
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<CityLocation[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      searchAbortRef.current?.abort();
    };
  }, []);

  async function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = searchQuery.trim();
    if (trimmed.length < 2) {
      setSearchError('Enter at least 2 characters.');
      return;
    }

    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    setSearching(true);
    setSearchError(null);
    try {
      const res = await fetch(`/api/locations/search?q=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
      });
      const json = (await res.json()) as { locations?: CityLocation[]; error?: string };
      if (!res.ok) {
        setSearchError(json.error ?? 'Search failed.');
        setSearchResults(null);
      } else {
        setSearchResults(json.locations ?? []);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setSearchError('Unable to reach location search.');
    } finally {
      if (!controller.signal.aborted) {
        setSearching(false);
      }
    }
  }

  function clearSearch() {
    searchAbortRef.current?.abort();
    setSearchQuery('');
    setSearchResults(null);
    setSearchError(null);
  }

  const displayedLocations = searchResults ?? curatedLocations;

  const sidebarContent = (
    <div className="flex h-full flex-col justify-between bg-white dark:bg-[#0D1320] border-r border-slate-200 dark:border-slate-800/90">
      <div className="flex flex-col overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-5 border-b border-slate-200 dark:border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30">
              <Wind className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <div className="font-display text-base font-bold tracking-tight text-slate-900 dark:text-slate-50">
                U-AQA
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Urban Air Quality Assistant
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close navigation menu"
            className="md:hidden rounded-lg p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <nav aria-label="Primary navigation" className="px-3 py-4 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => {
                  onSelectSection(item.id);
                  onCloseMobile();
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                  isActive
                    ? 'bg-cyan-500/12 text-cyan-700 dark:text-cyan-300 border border-cyan-500/25'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60 border border-transparent'
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="px-4 pt-3 pb-5 border-t border-slate-200 dark:border-slate-800/80">
          <div className="flex items-center justify-between mb-2.5">
            <h2 className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              City Locations
            </h2>
            {searchResults !== null && (
              <button
                type="button"
                onClick={clearSearch}
                className="text-xs text-cyan-600 dark:text-cyan-400 hover:underline"
              >
                Reset
              </button>
            )}
          </div>

          <form onSubmit={handleSearchSubmit} className="mb-3">
            <label htmlFor="city-search-input" className="sr-only">
              Search any city globally
            </label>
            <div className="relative flex items-center">
              <Search
                className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-slate-400"
                aria-hidden="true"
              />
              <input
                id="city-search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search city (e.g. Pune)"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700/80 bg-slate-50 dark:bg-slate-900/70 pl-8 pr-14 py-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-cyan-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={searching}
                className="absolute right-1.5 rounded px-2 py-1 text-[11px] font-medium bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-cyan-500/20"
              >
                {searching ? '...' : 'Find'}
              </button>
            </div>
            {searchError && (
              <p className="mt-1.5 text-xs text-rose-600 dark:text-rose-400" role="alert">
                {searchError}
              </p>
            )}
          </form>

          <div className="space-y-1 max-h-64 overflow-y-auto pr-1" role="list" aria-label="Cities">
            {displayedLocations.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
                No matching cities found.
              </p>
            ) : (
              displayedLocations.map((loc) => {
                const isSelected = loc.id === selectedLocation.id;
                return (
                  <button
                    key={loc.id}
                    type="button"
                    onClick={() => {
                      onSelectLocation(loc);
                      onCloseMobile();
                    }}
                    className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left text-xs transition-colors ${
                      isSelected
                        ? 'bg-slate-900 text-white dark:bg-slate-800 dark:text-cyan-300 font-medium'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <MapPin className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
                      <span className="truncate">{loc.name}</span>
                    </span>
                    <span className="text-[11px] opacity-65 shrink-0 ml-2">
                      {loc.country === 'India' ? 'IN' : loc.country.slice(0, 2).toUpperCase()}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-800/80 text-xs text-slate-500 dark:text-slate-400">
        Breathe smarter. Travel safer. Live healthier.
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden md:block w-64 shrink-0 h-screen sticky top-0">{sidebarContent}</aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/60"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative z-10 w-72 max-w-[85vw] h-full">{sidebarContent}</div>
        </div>
      )}
    </>
  );
}
