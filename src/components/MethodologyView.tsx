export function MethodologyView() {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-50">
          Data Sources, AQI Standards & Methodology
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Transparent documentation of environmental model data, unit conversions, CPCB breakpoint calculations, storage architecture, and known limitations.
        </p>
      </div>

      <div className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800">
        <section className="p-6 space-y-2">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            1. Provider-Sourced Modelled Environmental Data
          </h2>
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            City-level air quality estimates and historical/forecast hourly series are retrieved from the{' '}
            <span className="font-medium text-slate-900 dark:text-slate-100">
              Open-Meteo Air Quality API
            </span>{' '}
            using the Copernicus Atmosphere Monitoring Service (CAMS Global atmospheric composition model, updated hourly at ~11 km to 40 km spatial grid resolution). These figures are gridded model estimates—not direct ground-based regulatory monitoring station measurements.
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Supported gases and aerosols: PM2.5 (μg/m³), PM10 (μg/m³), Carbon Monoxide (μg/m³), Nitrogen Dioxide (μg/m³), Sulphur Dioxide (μg/m³), and Ozone (μg/m³).
          </p>
        </section>

        <section className="p-6 space-y-2">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            2. CPCB-Style NAQI (India) vs US EPA vs European EAQI
          </h2>
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            U-AQA keeps each standard distinct and never labels US EPA or European AQI numbers as Indian CPCB AQI. When{' '}
            <span className="font-medium text-slate-900 dark:text-slate-100">CPCB (India)</span> is selected, the backend computes sub-indices from modelled pollutant concentrations using Central Pollution Control Board (2014) breakpoints (`0–50 Good`, `51–100 Satisfactory`, `101–200 Moderate`, `201–300 Poor`, `301–400 Very Poor`, `401–500 Severe`).
          </p>
          <ul className="text-xs space-y-1 text-slate-600 dark:text-slate-400 list-disc pl-4">
            <li>
              Carbon Monoxide (CO) is returned by Open-Meteo in μg/m³ and divided by 1,000 to match CPCB&apos;s mg/m³ breakpoint table.
            </li>
            <li>
              Per CPCB rules, an overall CPCB-style NAQI is computed only when at least 3 pollutants are present, including PM2.5 or PM10. Otherwise it is reported as Insufficient Data.
            </li>
            <li>
              Official regulatory CPCB NAQI relies on 24-hour ground-station averages (8-hour for CO and O3); U-AQA&apos;s figure is an hourly model-derived estimate for real-time responsiveness.
            </li>
          </ul>
        </section>

        <section className="p-6 space-y-2">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            3. Missing Values, Freshness, Caching & Storage
          </h2>
          <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            Missing or negative values remain <span className="font-mono">Unavailable</span> and are never coerced to zero. Responses are cached in memory for 10 minutes with an 8-second upstream timeout, and recent model snapshots are stored in SQLite (`node:sqlite`) so temporary provider outages show a clearly labeled stale cached estimate rather than fabricating readings.
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Note: In container deployments, attach persistent disk storage to the database path (`DB_PATH`) to retain snapshots and unverified citizen observations across restarts.
          </p>
        </section>

        <section className="p-6 space-y-2">
          <h2 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
            4. Known Limitations & Planned Enhancements
          </h2>
          <ul className="text-xs space-y-1.5 text-slate-600 dark:text-slate-400 list-disc pl-4">
            <li>
              Gridded CAMS atmospheric models capture regional urban background well but cannot resolve hyper-local street-canyon diesel plumes or open burning; community reports remain explicitly marked unverified.
            </li>
            <li>
              Cleaner Route Suggestions: Real-time low-pollution routing is documented as a future enhancement because reliable street-by-street routing requires verified road-network sensor density and dedicated routing geometry APIs rather than coarse city-level grid estimates.
            </li>
            <li>
              All activity and respiratory precautions are general environmental guidance and do not constitute medical diagnosis or clinical advice.
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
