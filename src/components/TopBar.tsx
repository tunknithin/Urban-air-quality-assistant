import { Menu, Moon, RefreshCw, Sun } from 'lucide-react';
import type { AqiStandard, CityLocation } from '../../shared/types';
import type { NavSection } from './Sidebar';

interface TopBarProps {
  activeSection: NavSection;
  selectedLocation: CityLocation;
  standard: AqiStandard;
  onChangeStandard: (std: AqiStandard) => void;
  isDark: boolean;
  onToggleTheme: () => void;
  onRefresh: () => void;
  loading: boolean;
  onOpenMobileMenu: () => void;
}

const SECTION_LABELS: Record<NavSection, string> = {
  dashboard: 'Live Overview',
  map: 'Pollution Map',
  assistant: 'AI Assistant',
  reports: 'Community Reports',
  methodology: 'Data & Standards',
};

export function TopBar({
  activeSection,
  selectedLocation,
  standard,
  onChangeStandard,
  isDark,
  onToggleTheme,
  onRefresh,
  loading,
  onOpenMobileMenu,
}: TopBarProps) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between gap-4 px-4 sm:px-6 py-3 bg-white/90 dark:bg-[#090D16]/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800/90">
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Open navigation menu"
          className="md:hidden inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
        >
          <Menu className="h-4 w-4" aria-hidden="true" />
        </button>

        <div className="flex items-center gap-2 text-sm min-w-0">
          <span className="font-display font-semibold text-slate-900 dark:text-slate-100 truncate">
            {selectedLocation.name}
          </span>
          <span className="hidden sm:inline text-slate-400" aria-hidden="true">
            /
          </span>
          <span className="hidden sm:inline text-slate-500 dark:text-slate-400 truncate">
            {SECTION_LABELS[activeSection]}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2.5 shrink-0">
        <div
          role="group"
          aria-label="AQI standard selector"
          className="hidden sm:flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
        >
          {(
            [
              { id: 'cpcb', label: 'CPCB (India)' },
              { id: 'us_epa', label: 'US EPA' },
              { id: 'european', label: 'European' },
            ] as const
          ).map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => onChangeStandard(opt.id)}
              aria-pressed={standard === opt.id}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                standard === opt.id
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-cyan-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          className="inline-flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
        >
          {isDark ? (
            <Sun className="h-4 w-4 text-amber-400" aria-hidden="true" />
          ) : (
            <Moon className="h-4 w-4 text-slate-700" aria-hidden="true" />
          )}
        </button>

        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          aria-label="Refresh air quality readings"
          className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 px-3 py-2 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          <span>Refresh</span>
        </button>
      </div>
    </header>
  );
}
