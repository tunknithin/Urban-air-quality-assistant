import type { AqiCategoryKey, AqiStandard } from '../../shared/types';

export function formatStandardLabel(standard: AqiStandard): string {
  if (standard === 'cpcb') return 'CPCB';
  if (standard === 'us_epa') return 'US EPA';
  return 'European';
}

export interface SeverityStyle {
  textClass: string;
  bgSubtleClass: string;
  borderClass: string;
  hex: string;
  markerSymbol: string;
}

export function getSeverityStyle(key: AqiCategoryKey): SeverityStyle {
  switch (key) {
    case 'good':
      return {
        textClass: 'text-emerald-600 dark:text-lime-400',
        bgSubtleClass: 'bg-emerald-500/10 dark:bg-lime-500/10',
        borderClass: 'border-emerald-500/30 dark:border-lime-500/30',
        hex: '#22c55e',
        markerSymbol: '●',
      };
    case 'satisfactory':
      return {
        textClass: 'text-cyan-700 dark:text-cyan-400',
        bgSubtleClass: 'bg-cyan-500/10',
        borderClass: 'border-cyan-500/30',
        hex: '#06b6d4',
        markerSymbol: '◆',
      };
    case 'moderate':
      return {
        textClass: 'text-amber-700 dark:text-amber-400',
        bgSubtleClass: 'bg-amber-500/10',
        borderClass: 'border-amber-500/30',
        hex: '#f59e0b',
        markerSymbol: '▲',
      };
    case 'poor':
      return {
        textClass: 'text-orange-700 dark:text-orange-400',
        bgSubtleClass: 'bg-orange-500/10',
        borderClass: 'border-orange-500/30',
        hex: '#f97316',
        markerSymbol: '▲',
      };
    case 'very_poor':
      return {
        textClass: 'text-rose-700 dark:text-rose-400',
        bgSubtleClass: 'bg-rose-500/10',
        borderClass: 'border-rose-500/30',
        hex: '#f43f5e',
        markerSymbol: '■',
      };
    case 'severe':
      return {
        textClass: 'text-fuchsia-700 dark:text-fuchsia-400',
        bgSubtleClass: 'bg-fuchsia-500/10',
        borderClass: 'border-fuchsia-500/30',
        hex: '#d946ef',
        markerSymbol: '✖',
      };
    case 'unavailable':
    default:
      return {
        textClass: 'text-slate-600 dark:text-slate-400',
        bgSubtleClass: 'bg-slate-500/10',
        borderClass: 'border-slate-500/30',
        hex: '#64748b',
        markerSymbol: '—',
      };
  }
}

export function formatUtcTimestamp(iso: string): string {
  if (!iso) return 'Timestamp unavailable';
  const normalized = iso.endsWith('Z') ? iso : `${iso}Z`;
  const d = new Date(normalized);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}
