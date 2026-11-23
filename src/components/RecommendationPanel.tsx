import { AlertTriangle, CheckCircle2, Home, ShieldAlert, Sparkles } from 'lucide-react';
import type { SmartRecommendation } from '../../shared/types';
import { formatStandardLabel, getSeverityStyle } from '../utils/aqiTheme';

interface RecommendationPanelProps {
  recommendation: SmartRecommendation;
  onAskAssistant: (question: string) => void;
}

export function RecommendationPanel({
  recommendation,
  onAskAssistant,
}: RecommendationPanelProps) {
  const style = getSeverityStyle(recommendation.categoryKey);

  return (
    <section
      aria-labelledby="recommendations-heading"
      className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 space-y-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 pb-5 border-b border-slate-200 dark:border-slate-800">
        <div className="space-y-1 max-w-2xl">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Actionable Guidance · {formatStandardLabel(recommendation.standardUsed)} Standard
          </div>
          <h2
            id="recommendations-heading"
            className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100"
          >
            {recommendation.headline}
          </h2>
        </div>

        <button
          type="button"
          onClick={() => onAskAssistant('Is it safe to go running today and what precautions should I take?')}
          className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3.5 py-2 text-xs font-semibold text-cyan-700 dark:text-cyan-300 hover:bg-cyan-500/20 transition-colors whitespace-nowrap shrink-0"
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Ask AI About Today</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-2.5">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            {recommendation.categoryKey === 'good' || recommendation.categoryKey === 'satisfactory' ? (
              <CheckCircle2 className={`h-4 w-4 shrink-0 ${style.textClass}`} aria-hidden="true" />
            ) : (
              <AlertTriangle className={`h-4 w-4 shrink-0 ${style.textClass}`} aria-hidden="true" />
            )}
            <span>Outdoor Activity: {recommendation.outdoorActivity.verdict}</span>
          </div>
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {recommendation.outdoorActivity.summary}
          </p>
          <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-400 list-disc pl-4">
            {recommendation.outdoorActivity.activities.map((act) => (
              <li key={act}>{act}</li>
            ))}
          </ul>
        </div>

        <div className="space-y-2.5 lg:border-l lg:border-slate-200 dark:lg:border-slate-800 lg:pl-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <ShieldAlert className={`h-4 w-4 shrink-0 ${style.textClass}`} aria-hidden="true" />
            <span>Sensitive Groups · {recommendation.sensitiveGroups.riskLevel} Risk</span>
          </div>
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {recommendation.sensitiveGroups.guidance}
          </p>
          <div className="pt-1">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1">
              Practical Precautions
            </div>
            <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-400 list-disc pl-4">
              {recommendation.precautions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>

        <div className="space-y-2.5 lg:border-l lg:border-slate-200 dark:lg:border-slate-800 lg:pl-6">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <Home className="h-4 w-4 shrink-0 text-cyan-600 dark:text-cyan-400" aria-hidden="true" />
            <span>Indoor Alternatives & Forecast</span>
          </div>
          <ul className="space-y-1 text-xs text-slate-600 dark:text-slate-300 list-disc pl-4">
            {recommendation.indoorAlternatives.map((alt) => (
              <li key={alt}>{alt}</li>
            ))}
          </ul>
          <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800/80">
            {recommendation.forecastSummary.message}
          </p>
        </div>
      </div>

      <div className="pt-4 border-t border-slate-200 dark:border-slate-800 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
        <span className="font-semibold text-slate-800 dark:text-slate-100">Why air quality looks like this: </span>
        {recommendation.pollutionExplanation}
      </div>
    </section>
  );
}
