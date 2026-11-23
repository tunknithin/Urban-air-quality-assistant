import type { PollutantReading } from '../../shared/types';
import { classifyCpcbCategory } from '../utils/pollutantHelpers';
import { getSeverityStyle } from '../utils/aqiTheme';

interface PollutantGridProps {
  pollutants: PollutantReading[];
}

export function PollutantGrid({ pollutants }: PollutantGridProps) {
  return (
    <section aria-labelledby="pollutants-heading" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 id="pollutants-heading" className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100">
            Pollutant Concentrations
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Raw surface mass concentrations shown separately from dimensionless CPCB sub-indices.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {pollutants.map((item) => {
          const catKey = classifyCpcbCategory(item.cpcbSubIndex);
          const style = getSeverityStyle(catKey);
          const isMissing = item.value === null;

          return (
            <article
              key={item.key}
              className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between gap-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {item.label}
                  </div>
                  <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100 mt-0.5">
                    {item.shortName}
                  </h3>
                </div>
                <span className={`text-xs font-medium shrink-0 ${style.textClass}`}>
                  {style.markerSymbol} {item.statusText}
                </span>
              </div>

              <div className="flex items-baseline justify-between gap-3 pt-1 border-t border-slate-100 dark:border-slate-800/80">
                <div>
                  {isMissing ? (
                    <span className="font-mono text-xl font-semibold text-slate-400 dark:text-slate-500">
                      Unavailable
                    </span>
                  ) : (
                    <div className="flex items-baseline gap-1.5">
                      <span className="font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
                        {item.value}
                      </span>
                      <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                        {item.unit}
                      </span>
                    </div>
                  )}
                </div>

                <div className="text-right">
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">CPCB Sub-Index</div>
                  <div className="font-mono text-sm font-medium tabular-nums text-slate-700 dark:text-slate-200">
                    {item.cpcbSubIndex !== null ? item.cpcbSubIndex : '—'}
                  </div>
                </div>
              </div>

              <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
                {item.description}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
