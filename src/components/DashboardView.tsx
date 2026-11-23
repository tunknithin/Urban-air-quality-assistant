import { AlertCircle, Clock, Database, Info } from 'lucide-react';
import type {
  AqiStandard,
  NormalizedAqiData,
  SmartRecommendation,
} from '../../shared/types';
import { formatUtcTimestamp, getSeverityStyle } from '../utils/aqiTheme';
import { PollutantGrid } from './PollutantGrid';
import { RecommendationPanel } from './RecommendationPanel';
import { TrendChart } from './TrendChart';

interface DashboardViewProps {
  aqi: NormalizedAqiData | null;
  recommendation: SmartRecommendation | null;
  standard: AqiStandard;
  onChangeStandard: (std: AqiStandard) => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  onAskAssistant: (question: string) => void;
}

export function DashboardView({
  aqi,
  recommendation,
  standard,
  onChangeStandard,
  loading,
  error,
  onRetry,
  onAskAssistant,
}: DashboardViewProps) {
  if (loading && !aqi) {
    return (
      <div className="space-y-6 animate-pulse" aria-busy="true" aria-label="Loading air quality data">
        <div className="h-52 rounded-xl bg-slate-200 dark:bg-slate-800/60" />
        <div className="h-44 rounded-xl bg-slate-200 dark:bg-slate-800/60" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="h-36 rounded-xl bg-slate-200 dark:bg-slate-800/60" />
          <div className="h-36 rounded-xl bg-slate-200 dark:bg-slate-800/60" />
          <div className="h-36 rounded-xl bg-slate-200 dark:bg-slate-800/60" />
        </div>
      </div>
    );
  }

  if (error && !aqi) {
    return (
      <div
        role="alert"
        className="rounded-xl bg-white dark:bg-[#111827] border border-rose-500/30 p-8 text-center space-y-4"
      >
        <AlertCircle className="h-8 w-8 text-rose-500 mx-auto" aria-hidden="true" />
        <div className="space-y-1">
          <h2 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
            Unable to Load Air Quality Estimates
          </h2>
          <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">{error}</p>
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-lg bg-cyan-600 hover:bg-cyan-500 px-4 py-2 text-xs font-semibold text-white transition-colors"
        >
          Retry Live Fetch
        </button>
      </div>
    );
  }

  if (!aqi || !recommendation) return null;

  const activeIndex =
    standard === 'cpcb'
      ? {
          label: 'Estimated CPCB NAQI (India)',
          value: aqi.indices.cpcb.value,
          category: aqi.indices.cpcb.category,
          categoryKey: aqi.indices.cpcb.categoryKey,
        }
      : standard === 'european'
      ? {
          label: 'European AQI Estimate (EAQI)',
          value: aqi.indices.european.value,
          category: aqi.indices.european.category,
          categoryKey: aqi.indices.european.categoryKey,
        }
      : {
          label: 'US EPA AQI Estimate',
          value: aqi.indices.usEpa.value,
          category: aqi.indices.usEpa.category,
          categoryKey: aqi.indices.usEpa.categoryKey,
        };

  const style = getSeverityStyle(activeIndex.categoryKey);

  const originLabel =
    aqi.dataOrigin === 'live_api_estimate'
      ? 'Live API Model Estimate'
      : aqi.dataOrigin === 'cached_snapshot'
      ? 'Cached Model Estimate (Stale)'
      : 'Model Data Unavailable';

  return (
    <div className="space-y-8">
      {/* Mobile standard switcher */}
      <div className="sm:hidden flex items-center justify-between gap-2 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        {(
          [
            { id: 'cpcb', label: 'CPCB' },
            { id: 'us_epa', label: 'US EPA' },
            { id: 'european', label: 'European' },
          ] as const
        ).map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => onChangeStandard(opt.id)}
            aria-pressed={standard === opt.id}
            className={`flex-1 py-2 rounded-md text-xs font-medium transition-colors ${
              standard === opt.id
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-cyan-300 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Stale or fallback banner if applicable */}
      {(aqi.isStale || aqi.dataOrigin !== 'live_api_estimate' || aqi.errorMessage) && (
        <div
          role="status"
          aria-live="polite"
          className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-800 dark:text-amber-300"
        >
          <Info className="h-4 w-4 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <span className="font-semibold">Data freshness notice: </span>
            {aqi.errorMessage ??
              'Latest model estimate timestamp is more than 3 hours old. Check local conditions before strenuous outdoor exertion.'}
          </div>
        </div>
      )}

      {/* Dominant Hero AQI Panel */}
      <section
        aria-labelledby="location-aqi-heading"
        className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 sm:p-8"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-7 space-y-4">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {aqi.location.region}, {aqi.location.country}
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {aqi.location.latitude.toFixed(2)}°, {aqi.location.longitude.toFixed(2)}°
              </span>
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="font-mono">{formatUtcTimestamp(aqi.timestamp)}</span>
              </span>
            </div>

            <div className="flex flex-wrap items-baseline gap-5">
              <div>
                <div className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  {activeIndex.label}
                </div>
                <div className="flex items-baseline gap-3">
                  <span
                    id="location-aqi-heading"
                    className="font-mono text-5xl sm:text-6xl font-bold tracking-tight tabular-nums text-slate-900 dark:text-slate-50"
                    data-testid="hero-aqi-value"
                  >
                    {activeIndex.value !== null ? activeIndex.value : 'N/A'}
                  </span>
                  <span className={`text-lg sm:text-xl font-display font-semibold ${style.textClass}`}>
                    {style.markerSymbol} {activeIndex.category}
                  </span>
                </div>
              </div>
            </div>

            <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300 max-w-2xl">
              {recommendation.headline}{' '}
              {standard === 'cpcb' && aqi.indices.cpcb.dominantPollutant
                ? `Primary driver: ${aqi.indices.cpcb.dominantPollutant}.`
                : ''}
            </p>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400 pt-1">
              <span className="inline-flex items-center gap-1.5">
                <Database className="h-3.5 w-3.5" aria-hidden="true" />
                <span>{aqi.sourceName}</span>
              </span>
              <span aria-hidden="true">·</span>
              <span>{originLabel}</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              City-level air quality estimate derived from CAMS gridded atmospheric model data (~11–40 km resolution), not a physical roadside monitoring station.
            </p>
          </div>

          {/* Cross-standard comparison strip */}
          <div className="lg:col-span-5 lg:border-l lg:border-slate-200 dark:lg:border-slate-800 lg:pl-7 space-y-4">
            <div className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Cross-Standard Comparison
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80 text-sm">
              <div className="py-2.5 flex items-center justify-between gap-4">
                <div>
                  <div className="font-medium text-slate-800 dark:text-slate-200">
                    CPCB-Style NAQI (India)
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {aqi.indices.cpcb.category}
                  </div>
                </div>
                <div className="font-mono text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {aqi.indices.cpcb.value ?? 'Unavailable'}
                </div>
              </div>

              <div className="py-2.5 flex items-center justify-between gap-4">
                <div>
                  <div className="font-medium text-slate-800 dark:text-slate-200">US EPA AQI</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {aqi.indices.usEpa.category}
                  </div>
                </div>
                <div className="font-mono text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {aqi.indices.usEpa.value ?? 'Unavailable'}
                </div>
              </div>

              <div className="py-2.5 flex items-center justify-between gap-4">
                <div>
                  <div className="font-medium text-slate-800 dark:text-slate-200">
                    European AQI (EAQI)
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {aqi.indices.european.category}
                  </div>
                </div>
                <div className="font-mono text-lg font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {aqi.indices.european.value ?? 'Unavailable'}
                </div>
              </div>
            </div>
            <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
              {aqi.indices.cpcb.note}
            </p>
          </div>
        </div>
      </section>

      <RecommendationPanel recommendation={recommendation} onAskAssistant={onAskAssistant} />

      <PollutantGrid pollutants={aqi.pollutants} />

      <TrendChart hourly={aqi.hourly} standard={standard} />
    </div>
  );
}
