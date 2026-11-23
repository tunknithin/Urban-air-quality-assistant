import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, MapPin, RefreshCw } from 'lucide-react';
import type { CityLocation, CommunityReport } from '../../shared/types';
import { formatUtcTimestamp } from '../utils/aqiTheme';

interface CommunityReportsViewProps {
  selectedLocation: CityLocation;
}

const CATEGORIES: CommunityReport['category'][] = [
  'Smoke',
  'Road Dust',
  'Waste Burning',
  'Industrial Emissions',
  'Traffic Haze',
];

const SEVERITIES: CommunityReport['severity'][] = ['Low', 'Moderate', 'High'];

export function CommunityReportsView({ selectedLocation }: CommunityReportsViewProps) {
  const [reports, setReports] = useState<CommunityReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [locationName, setLocationName] = useState(selectedLocation.name);
  const [category, setCategory] = useState<CommunityReport['category']>('Smoke');
  const [severity, setSeverity] = useState<CommunityReport['severity']>('Moderate');
  const [description, setDescription] = useState('');
  const [attachCoords, setAttachCoords] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  const submittingLockRef = useRef(false);
  const fetchAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setLocationName(selectedLocation.name);
  }, [selectedLocation.name]);

  const fetchReports = useCallback(async () => {
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;

    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/reports', { signal: controller.signal });
      const json = (await res.json()) as { reports?: CommunityReport[]; error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? `Unable to load reports (HTTP ${res.status}).`);
      }
      setReports(json.reports ?? []);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setLoadError(
        err instanceof Error ? err.message : 'Network error while loading community reports.'
      );
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchReports();
    return () => {
      fetchAbortRef.current?.abort();
    };
  }, [fetchReports]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingLockRef.current || submitting) return;

    setFormError(null);
    setFormSuccess(null);

    const trimmedLocation = locationName.trim();
    const trimmedDesc = description.trim();

    if (trimmedLocation.length < 2 || trimmedLocation.length > 80) {
      setFormError('Location name must be between 2 and 80 characters.');
      return;
    }
    if (trimmedDesc.length < 10 || trimmedDesc.length > 400) {
      setFormError('Observation details must be between 10 and 400 characters.');
      return;
    }

    submittingLockRef.current = true;
    setSubmitting(true);
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          locationName: trimmedLocation,
          category,
          severity,
          description: trimmedDesc,
          latitude: attachCoords ? selectedLocation.latitude : null,
          longitude: attachCoords ? selectedLocation.longitude : null,
        }),
      });

      const json = (await res.json()) as { report?: CommunityReport; error?: string };
      if (!res.ok || !json.report) {
        setFormError(json.error ?? `Could not save report (HTTP ${res.status}).`);
      } else {
        setReports((prev) => [json.report!, ...prev]);
        setDescription('');
        setFormSuccess('Observation logged as an unverified citizen report.');
      }
    } catch {
      setFormError('Network error while submitting report. Please try again.');
    } finally {
      submittingLockRef.current = false;
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-50">
          Community Pollution Reports
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Log hyper-local events (open waste burning, construction dust, or industrial plumes) that regional atmospheric models may miss. All submissions are strictly marked unverified and kept separate from Open-Meteo model estimates.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <form
          onSubmit={handleSubmit}
          className="lg:col-span-5 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 space-y-4"
        >
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            Submit Local Observation
          </h2>

          <div>
            <label
              htmlFor="report-location-input"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Neighborhood or Street
            </label>
            <input
              id="report-location-input"
              type="text"
              value={locationName}
              onChange={(e) => setLocationName(e.target.value)}
              maxLength={80}
              required
              disabled={submitting}
              placeholder="e.g. Anand Vihar Bus Terminal"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-cyan-500 focus:outline-none disabled:opacity-60"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="report-category-select"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Pollution Type
              </label>
              <select
                id="report-category-select"
                value={category}
                disabled={submitting}
                onChange={(e) => setCategory(e.target.value as CommunityReport['category'])}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-cyan-500 focus:outline-none disabled:opacity-60"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="report-severity-select"
                className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
              >
                Observed Severity
              </label>
              <select
                id="report-severity-select"
                value={severity}
                disabled={submitting}
                onChange={(e) => setSeverity(e.target.value as CommunityReport['severity'])}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-cyan-500 focus:outline-none disabled:opacity-60"
              >
                {SEVERITIES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label
              htmlFor="report-description-input"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Observation Details
            </label>
            <textarea
              id="report-description-input"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={400}
              required
              disabled={submitting}
              placeholder="Describe visible smoke, dust source, odor, or affected road stretch (10–400 chars)..."
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-cyan-500 focus:outline-none disabled:opacity-60"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={attachCoords}
              disabled={submitting}
              onChange={(e) => setAttachCoords(e.target.checked)}
              className="rounded border-slate-300 dark:border-slate-700 text-cyan-600 focus:ring-cyan-500"
            />
            <span>
              Attach {selectedLocation.name} coordinates ({selectedLocation.latitude.toFixed(2)}°,{' '}
              {selectedLocation.longitude.toFixed(2)}°)
            </span>
          </label>

          {formError && (
            <div
              role="alert"
              className="rounded-lg bg-rose-500/10 border border-rose-500/30 px-3 py-2 text-xs text-rose-600 dark:text-rose-400"
            >
              {formError}
            </div>
          )}

          {formSuccess && (
            <div
              role="status"
              className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 text-xs text-emerald-700 dark:text-lime-400"
            >
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{formSuccess}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 px-4 py-2.5 text-xs font-semibold text-white transition-colors"
          >
            {submitting ? 'Submitting...' : 'Submit Report'}
          </button>
        </form>

        <section
          aria-labelledby="recent-reports-heading"
          className="lg:col-span-7 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 space-y-4"
        >
          <div className="flex items-center justify-between gap-4 pb-3 border-b border-slate-200 dark:border-slate-800">
            <h2
              id="recent-reports-heading"
              className="font-display text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              Recent Unverified Citizen Observations
            </h2>
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                {reports.length} logged
              </span>
              <button
                type="button"
                onClick={() => void fetchReports()}
                disabled={loading}
                aria-label="Reload community reports"
                className="rounded p-1 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
              >
                <RefreshCw
                  className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>

          {loadError ? (
            <div
              role="alert"
              className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-center space-y-3"
            >
              <AlertCircle className="h-6 w-6 text-rose-500 mx-auto" aria-hidden="true" />
              <p className="text-xs text-rose-700 dark:text-rose-300">{loadError}</p>
              <button
                type="button"
                onClick={() => void fetchReports()}
                className="rounded-lg bg-rose-600 hover:bg-rose-500 px-3 py-1.5 text-xs font-semibold text-white"
              >
                Retry Load
              </button>
            </div>
          ) : loading ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-8 text-center">
              Loading community reports...
            </p>
          ) : reports.length === 0 ? (
            <div className="py-12 text-center space-y-2 border border-dashed border-slate-200 dark:border-slate-800 rounded-lg px-4">
              <AlertTriangle className="h-6 w-6 text-amber-500 mx-auto" aria-hidden="true" />
              <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                No community observations logged yet
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
                Use the form to report localized smoke, road dust, or waste burning in your neighborhood.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800/80" data-testid="community-reports-list">
              {reports.map((rep) => (
                <li key={rep.id} className="py-4 first:pt-1 last:pb-1 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                      <MapPin className="h-3.5 w-3.5 text-cyan-500 shrink-0" aria-hidden="true" />
                      <span>{rep.locationName}</span>
                    </div>
                    <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                      {rep.verified ? 'Reviewed' : 'Unverified citizen report'} · {rep.severity} Severity
                    </span>
                  </div>

                  <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                    {rep.description}
                  </p>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span>{rep.category}</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono">{formatUtcTimestamp(rep.createdAt)}</span>
                    {rep.latitude !== null && rep.longitude !== null && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {rep.latitude.toFixed(2)}°, {rep.longitude.toFixed(2)}°
                        </span>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
