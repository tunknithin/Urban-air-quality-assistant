import React, { useMemo, useState } from 'react';
import type { AqiStandard, HourlyDataPoint } from '../../shared/types';
import { formatStandardLabel } from '../utils/aqiTheme';

interface TrendChartProps {
  hourly: HourlyDataPoint[];
  standard: AqiStandard;
}

type ChartMetric = 'aqi' | 'pm2_5' | 'pm10' | 'gases';

export function TrendChart({ hourly, standard }: TrendChartProps) {
  const [metric, setMetric] = useState<ChartMetric>('aqi');
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const series = useMemo(() => hourly.slice(-84), [hourly]);

  const nowIndex = useMemo(() => {
    const idx = series.findIndex((pt) => pt.isForecast);
    return idx === -1 ? series.length - 1 : Math.max(0, idx - 1);
  }, [series]);

  const values = useMemo(() => {
    return series.map((pt) => {
      if (metric === 'aqi') {
        if (standard === 'cpcb') return pt.cpcbAqi;
        if (standard === 'european') return pt.europeanAqi;
        return pt.usAqi;
      }
      if (metric === 'pm2_5') return pt.pm2_5;
      if (metric === 'pm10') return pt.pm10;
      return pt.nitrogen_dioxide;
    });
  }, [series, metric, standard]);

  const secondaryValues = useMemo(() => {
    if (metric !== 'gases') return null;
    return series.map((pt) => pt.ozone);
  }, [series, metric]);

  const numericVals = [
    ...values.filter((v): v is number => v !== null),
    ...(secondaryValues ? secondaryValues.filter((v): v is number => v !== null) : []),
  ];

  const maxVal = numericVals.length > 0 ? Math.max(...numericVals, 20) * 1.12 : 100;
  const minVal = 0;

  const width = 820;
  const height = 260;
  const padLeft = 44;
  const padRight = 18;
  const padTop = 20;
  const padBottom = 34;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const xFor = (i: number) =>
    series.length <= 1 ? padLeft : padLeft + (i / (series.length - 1)) * plotW;
  const yFor = (val: number) =>
    padTop + plotH - ((val - minVal) / (maxVal - minVal || 1)) * plotH;

  // Split contiguous non-null ranges so missing hours create visible gaps instead of misleading interpolation
  function buildSegments(vals: Array<number | null>): {
    historical: string[];
    forecast: string[];
  } {
    const historical: string[] = [];
    const forecast: string[] = [];
    let currentHist: string[] = [];
    let currentForecast: string[] = [];

    vals.forEach((v, idx) => {
      if (v === null) {
        if (currentHist.length > 0) {
          historical.push(currentHist.join(' '));
          currentHist = [];
        }
        if (currentForecast.length > 0) {
          forecast.push(currentForecast.join(' '));
          currentForecast = [];
        }
        return;
      }
      const coord = `${xFor(idx).toFixed(1)},${yFor(v).toFixed(1)}`;
      if (idx <= nowIndex) {
        currentHist.push(coord);
      }
      if (idx >= nowIndex) {
        currentForecast.push(coord);
      }
    });

    if (currentHist.length > 0) historical.push(currentHist.join(' '));
    if (currentForecast.length > 0) forecast.push(currentForecast.join(' '));

    return { historical, forecast };
  }

  const primarySegs = buildSegments(values);
  const secondarySegs = secondaryValues ? buildSegments(secondaryValues) : null;

  const activeHover =
    hoverIndex !== null && series[hoverIndex]
      ? {
          point: series[hoverIndex],
          val: values[hoverIndex],
          secVal: secondaryValues ? secondaryValues[hoverIndex] : null,
          x: xFor(hoverIndex),
        }
      : null;

  const metricUnit = metric === 'aqi' ? 'Index' : 'μg/m³';
  const primaryLabel =
    metric === 'aqi'
      ? `${formatStandardLabel(standard)} AQI`
      : metric === 'pm2_5'
      ? 'PM2.5'
      : metric === 'pm10'
      ? 'PM10'
      : 'NO2';

  function handleChartKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (series.length === 0) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      setHoverIndex((prev) => (prev === null ? 0 : Math.min(series.length - 1, prev + 1)));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      setHoverIndex((prev) => (prev === null ? series.length - 1 : Math.max(0, prev - 1)));
    } else if (e.key === 'Home') {
      e.preventDefault();
      setHoverIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      setHoverIndex(series.length - 1);
    }
  }

  return (
    <section
      aria-labelledby="trends-heading"
      className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2
            id="trends-heading"
            className="font-display text-lg font-semibold text-slate-900 dark:text-slate-100"
          >
            Historical & Forecast Trajectory
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Solid line indicates past modelled hours · Dashed line indicates model forecast hours. Missing hours leave breaks rather than interpolated lines.
          </p>
        </div>

        <div
          role="group"
          aria-label="Chart metric selector"
          className="flex items-center p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
        >
          {(
            [
              { id: 'aqi', label: 'AQI' },
              { id: 'pm2_5', label: 'PM2.5' },
              { id: 'pm10', label: 'PM10' },
              { id: 'gases', label: 'NO2 + O3' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setMetric(tab.id)}
              aria-pressed={metric === tab.id}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                metric === tab.id
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-cyan-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {series.length === 0 || numericVals.length === 0 ? (
        <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg">
          Hourly historical and forecast series are currently unavailable for this location.
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs min-h-[24px]">
            <div className="flex items-center gap-4 text-slate-600 dark:text-slate-300">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-0.5 w-4 bg-cyan-500 inline-block" aria-hidden="true" />
                <span>{primaryLabel} (Past)</span>
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="h-0.5 w-4 border-t-2 border-dashed border-lime-500 inline-block"
                  aria-hidden="true"
                />
                <span>Forecast</span>
              </span>
              {metric === 'gases' && (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-0.5 w-4 bg-violet-500 inline-block" aria-hidden="true" />
                  <span>O3 (Ozone)</span>
                </span>
              )}
            </div>

            <div
              aria-live="polite"
              className={
                activeHover
                  ? 'font-mono tabular-nums text-slate-800 dark:text-cyan-300'
                  : 'text-slate-500 dark:text-slate-400'
              }
            >
              {activeHover ? (
                <>
                  {activeHover.point.time.replace('T', ' ')} UTC ·{' '}
                  {activeHover.point.isForecast ? 'Forecast' : 'Past Model'} · {primaryLabel}:{' '}
                  {activeHover.val !== null ? `${activeHover.val} ${metricUnit}` : 'Unavailable'}
                  {metric === 'gases'
                    ? ` · O3: ${activeHover.secVal !== null ? `${activeHover.secVal} μg/m³` : 'Unavailable'}`
                    : ''}
                </>
              ) : (
                'Hover, tap, or use Arrow keys to inspect hourly estimates'
              )}
            </div>
          </div>

          <div
            tabIndex={0}
            role="application"
            aria-label={`${primaryLabel} interactive trend chart. Use Left and Right Arrow keys to inspect hourly estimates.`}
            onKeyDown={handleChartKeyDown}
            className="w-full overflow-x-auto rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
          >
            <svg
              viewBox={`0 0 ${width} ${height}`}
              role="img"
              aria-label={`${primaryLabel} historical and forecast trend chart`}
              className="w-full min-w-[540px] h-auto select-none"
              onMouseLeave={() => setHoverIndex(null)}
            >
              {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
                const val = Math.round(minVal + frac * (maxVal - minVal));
                const y = yFor(val);
                return (
                  <g key={frac}>
                    <line
                      x1={padLeft}
                      y1={y}
                      x2={width - padRight}
                      y2={y}
                      stroke="currentColor"
                      className="text-slate-200 dark:text-slate-800"
                      strokeWidth="1"
                    />
                    <text
                      x={padLeft - 8}
                      y={y + 4}
                      textAnchor="end"
                      className="fill-slate-400 text-[10px] font-mono"
                    >
                      {val}
                    </text>
                  </g>
                );
              })}

              {nowIndex < series.length - 1 && (
                <rect
                  x={xFor(nowIndex)}
                  y={padTop}
                  width={Math.max(0, width - padRight - xFor(nowIndex))}
                  height={plotH}
                  className="fill-lime-500/5 dark:fill-lime-400/5"
                />
              )}

              <line
                x1={xFor(nowIndex)}
                y1={padTop}
                x2={xFor(nowIndex)}
                y2={padTop + plotH}
                stroke="#22c55e"
                strokeDasharray="4 4"
                strokeWidth="1.25"
              />
              <text
                x={xFor(nowIndex)}
                y={padTop - 6}
                textAnchor="middle"
                className="fill-emerald-600 dark:fill-lime-400 text-[10px] font-mono font-semibold"
              >
                NOW
              </text>

              {primarySegs.historical.map((pts, i) => (
                <polyline
                  key={`h-${i}`}
                  fill="none"
                  stroke="#06b6d4"
                  strokeWidth="2.25"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={pts}
                />
              ))}

              {primarySegs.forecast.map((pts, i) => (
                <polyline
                  key={`f-${i}`}
                  fill="none"
                  stroke="#84cc16"
                  strokeWidth="2.25"
                  strokeDasharray="5 4"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  points={pts}
                />
              ))}

              {secondarySegs?.historical.map((pts, i) => (
                <polyline
                  key={`sh-${i}`}
                  fill="none"
                  stroke="#8b5cf6"
                  strokeWidth="1.75"
                  strokeLinejoin="round"
                  points={pts}
                />
              ))}
              {secondarySegs?.forecast.map((pts, i) => (
                <polyline
                  key={`sf-${i}`}
                  fill="none"
                  stroke="#a78bfa"
                  strokeWidth="1.75"
                  strokeDasharray="4 4"
                  strokeLinejoin="round"
                  points={pts}
                />
              ))}

              {[0, Math.floor(series.length / 3), Math.floor((series.length * 2) / 3), series.length - 1]
                .filter((idx, i, arr) => idx >= 0 && idx < series.length && arr.indexOf(idx) === i)
                .map((idx, pos, arr) => (
                  <text
                    key={idx}
                    x={xFor(idx)}
                    y={height - 10}
                    textAnchor={pos === 0 ? 'start' : pos === arr.length - 1 ? 'end' : 'middle'}
                    className="fill-slate-400 text-[10px] font-mono"
                  >
                    {series[idx].time.slice(5, 16).replace('T', ' ')}
                  </text>
                ))}

              {activeHover && (
                <g>
                  <line
                    x1={activeHover.x}
                    y1={padTop}
                    x2={activeHover.x}
                    y2={padTop + plotH}
                    stroke="#94a3b8"
                    strokeWidth="1"
                  />
                  {activeHover.val !== null && (
                    <circle
                      cx={activeHover.x}
                      cy={yFor(activeHover.val)}
                      r="4"
                      fill={activeHover.point.isForecast ? '#84cc16' : '#06b6d4'}
                      stroke="#090D16"
                      strokeWidth="1.5"
                    />
                  )}
                </g>
              )}

              {series.map((pt, idx) => {
                const bandWidth = plotW / Math.max(1, series.length);
                return (
                  <rect
                    key={pt.time}
                    x={xFor(idx) - bandWidth / 2}
                    y={padTop}
                    width={bandWidth}
                    height={plotH}
                    fill="transparent"
                    onMouseEnter={() => setHoverIndex(idx)}
                    onClick={() => setHoverIndex(idx)}
                  />
                );
              })}
            </svg>
          </div>
        </div>
      )}
    </section>
  );
}
