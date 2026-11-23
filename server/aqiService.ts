import type {
  AqiCategoryKey,
  CityLocation,
  HourlyDataPoint,
  NormalizedAqiData,
  PollutantReading,
} from '../shared/types.ts';

const OPEN_METEO_AQI_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_CACHE_ENTRIES = 100;
const REQUEST_TIMEOUT_MS = 8000;
const STALE_THRESHOLD_MS = 3 * 60 * 60 * 1000; // 3 hours

interface CacheEntry {
  expiresAt: number;
  data: NormalizedAqiData;
}

const memoryCache = new Map<string, CacheEntry>();
const inflightRequests = new Map<string, Promise<NormalizedAqiData>>();

type Breakpoint = readonly [number, number, number, number]; // [B_lo, B_hi, I_lo, I_hi]

const CPCB_BREAKPOINTS: Record<string, readonly Breakpoint[]> = {
  pm2_5: [
    [0, 30, 0, 50],
    [30, 60, 51, 100],
    [60, 90, 101, 200],
    [90, 120, 201, 300],
    [120, 250, 301, 400],
    [250, 500, 401, 500],
  ],
  pm10: [
    [0, 50, 0, 50],
    [50, 100, 51, 100],
    [100, 250, 101, 200],
    [250, 350, 201, 300],
    [350, 430, 301, 400],
    [430, 600, 401, 500],
  ],
  nitrogen_dioxide: [
    [0, 40, 0, 50],
    [40, 80, 51, 100],
    [80, 180, 101, 200],
    [180, 280, 201, 300],
    [280, 400, 301, 400],
    [400, 600, 401, 500],
  ],
  sulphur_dioxide: [
    [0, 40, 0, 50],
    [40, 80, 51, 100],
    [80, 380, 101, 200],
    [380, 800, 201, 300],
    [800, 1600, 301, 400],
    [1600, 2000, 401, 500],
  ],
  // CO breakpoints in mg/m^3 (Open-Meteo returns ug/m^3, converted via /1000 before lookup)
  carbon_monoxide_mg: [
    [0, 1.0, 0, 50],
    [1.0, 2.0, 51, 100],
    [2.0, 10.0, 101, 200],
    [10.0, 17.0, 201, 300],
    [17.0, 34.0, 301, 400],
    [34.0, 50.0, 401, 500],
  ],
  ozone: [
    [0, 50, 0, 50],
    [50, 100, 51, 100],
    [100, 168, 101, 200],
    [168, 208, 201, 300],
    [208, 748, 301, 400],
    [748, 1000, 401, 500],
  ],
};

function isRecord(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

export function sanitizeNumericReading(raw: unknown): number | null {
  if (raw === null || raw === undefined || typeof raw === 'boolean') return null;
  if (typeof raw === 'string' && raw.trim().length === 0) return null;
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(num) || num < 0) return null;
  return Number(num.toFixed(1));
}

export function computeSubIndex(
  concentration: number | null,
  breakpoints: readonly Breakpoint[]
): number | null {
  if (concentration === null || !Number.isFinite(concentration) || concentration < 0) {
    return null;
  }
  for (const [bLo, bHi, iLo, iHi] of breakpoints) {
    if (concentration <= bHi) {
      const ratio = (concentration - bLo) / (bHi - bLo);
      return Math.round(ratio * (iHi - iLo) + iLo);
    }
  }
  return 500;
}

export function classifyCpcbCategory(aqi: number | null): {
  category: string;
  categoryKey: AqiCategoryKey;
} {
  if (aqi === null || !Number.isFinite(aqi) || aqi < 0) {
    return { category: 'Unavailable', categoryKey: 'unavailable' };
  }
  if (aqi <= 50) return { category: 'Good', categoryKey: 'good' };
  if (aqi <= 100) return { category: 'Satisfactory', categoryKey: 'satisfactory' };
  if (aqi <= 200) return { category: 'Moderate', categoryKey: 'moderate' };
  if (aqi <= 300) return { category: 'Poor', categoryKey: 'poor' };
  if (aqi <= 400) return { category: 'Very Poor', categoryKey: 'very_poor' };
  return { category: 'Severe', categoryKey: 'severe' };
}

export function classifyUsEpaCategory(aqi: number | null): {
  category: string;
  categoryKey: AqiCategoryKey;
} {
  if (aqi === null || !Number.isFinite(aqi) || aqi < 0) {
    return { category: 'Unavailable', categoryKey: 'unavailable' };
  }
  if (aqi <= 50) return { category: 'Good', categoryKey: 'good' };
  if (aqi <= 100) return { category: 'Moderate', categoryKey: 'satisfactory' };
  if (aqi <= 150) return { category: 'Unhealthy for Sensitive Groups', categoryKey: 'moderate' };
  if (aqi <= 200) return { category: 'Unhealthy', categoryKey: 'poor' };
  if (aqi <= 300) return { category: 'Very Unhealthy', categoryKey: 'very_poor' };
  return { category: 'Hazardous', categoryKey: 'severe' };
}

export function classifyEuropeanCategory(aqi: number | null): {
  category: string;
  categoryKey: AqiCategoryKey;
} {
  if (aqi === null || !Number.isFinite(aqi) || aqi < 0) {
    return { category: 'Unavailable', categoryKey: 'unavailable' };
  }
  if (aqi <= 20) return { category: 'Good', categoryKey: 'good' };
  if (aqi <= 40) return { category: 'Fair', categoryKey: 'satisfactory' };
  if (aqi <= 60) return { category: 'Moderate', categoryKey: 'moderate' };
  if (aqi <= 80) return { category: 'Poor', categoryKey: 'poor' };
  if (aqi <= 100) return { category: 'Very Poor', categoryKey: 'very_poor' };
  return { category: 'Extremely Poor', categoryKey: 'severe' };
}

export function computeCpcbAqiFromPollutants(values: {
  pm2_5: number | null;
  pm10: number | null;
  carbon_monoxide: number | null; // ug/m3
  nitrogen_dioxide: number | null;
  sulphur_dioxide: number | null;
  ozone: number | null;
}): {
  value: number | null;
  dominantPollutant: string | null;
  status: 'computed' | 'insufficient_data';
  subIndices: Record<string, number | null>;
} {
  const coMg =
    values.carbon_monoxide !== null ? Number((values.carbon_monoxide / 1000).toFixed(3)) : null;

  const subIndices: Record<string, number | null> = {
    pm2_5: computeSubIndex(values.pm2_5, CPCB_BREAKPOINTS.pm2_5),
    pm10: computeSubIndex(values.pm10, CPCB_BREAKPOINTS.pm10),
    carbon_monoxide: computeSubIndex(coMg, CPCB_BREAKPOINTS.carbon_monoxide_mg),
    nitrogen_dioxide: computeSubIndex(values.nitrogen_dioxide, CPCB_BREAKPOINTS.nitrogen_dioxide),
    sulphur_dioxide: computeSubIndex(values.sulphur_dioxide, CPCB_BREAKPOINTS.sulphur_dioxide),
    ozone: computeSubIndex(values.ozone, CPCB_BREAKPOINTS.ozone),
  };

  const labels: Record<string, string> = {
    pm2_5: 'PM2.5',
    pm10: 'PM10',
    carbon_monoxide: 'CO',
    nitrogen_dioxide: 'NO2',
    sulphur_dioxide: 'SO2',
    ozone: 'O3',
  };

  const availableEntries = Object.entries(subIndices).filter(
    (entry): entry is [string, number] => entry[1] !== null && Number.isFinite(entry[1])
  );

  const hasParticulate = subIndices.pm2_5 !== null || subIndices.pm10 !== null;

  // CPCB standard requires at least 3 pollutants, including PM2.5 or PM10
  if (availableEntries.length < 3 || !hasParticulate) {
    return {
      value: null,
      dominantPollutant: null,
      status: 'insufficient_data',
      subIndices,
    };
  }

  let maxVal = -1;
  let dominantKey = availableEntries[0][0];
  for (const [key, val] of availableEntries) {
    if (val > maxVal) {
      maxVal = val;
      dominantKey = key;
    }
  }

  return {
    value: maxVal,
    dominantPollutant: labels[dominantKey] ?? dominantKey,
    status: 'computed',
    subIndices,
  };
}

export function isTimestampStale(isoTimestamp: string, nowMs: number = Date.now()): boolean {
  if (!isoTimestamp) return true;
  const parsed = Date.parse(isoTimestamp.endsWith('Z') ? isoTimestamp : `${isoTimestamp}Z`);
  if (!Number.isFinite(parsed)) return true;
  return nowMs - parsed > STALE_THRESHOLD_MS;
}

function buildPollutantReadings(
  raw: {
    pm2_5: number | null;
    pm10: number | null;
    carbon_monoxide: number | null;
    nitrogen_dioxide: number | null;
    sulphur_dioxide: number | null;
    ozone: number | null;
  },
  subIndices: Record<string, number | null>
): PollutantReading[] {
  const statusFromSub = (sub: number | null): string => {
    if (sub === null) return 'Unavailable';
    return classifyCpcbCategory(sub).category;
  };

  return [
    {
      key: 'pm2_5',
      label: 'Fine Particulate Matter',
      shortName: 'PM2.5',
      value: raw.pm2_5,
      unit: 'μg/m³',
      cpcbSubIndex: subIndices.pm2_5 ?? null,
      statusText: statusFromSub(subIndices.pm2_5 ?? null),
      description: 'Inhalable particles ≤2.5 μm that penetrate deep into lungs and bloodstream.',
    },
    {
      key: 'pm10',
      label: 'Coarse Particulate Matter',
      shortName: 'PM10',
      value: raw.pm10,
      unit: 'μg/m³',
      cpcbSubIndex: subIndices.pm10 ?? null,
      statusText: statusFromSub(subIndices.pm10 ?? null),
      description: 'Road dust, construction debris, and pollen particles ≤10 μm.',
    },
    {
      key: 'nitrogen_dioxide',
      label: 'Nitrogen Dioxide',
      shortName: 'NO2',
      value: raw.nitrogen_dioxide,
      unit: 'μg/m³',
      cpcbSubIndex: subIndices.nitrogen_dioxide ?? null,
      statusText: statusFromSub(subIndices.nitrogen_dioxide ?? null),
      description: 'Traffic and fossil-fuel combustion gas that irritates airways.',
    },
    {
      key: 'ozone',
      label: 'Ground-Level Ozone',
      shortName: 'O3',
      value: raw.ozone,
      unit: 'μg/m³',
      cpcbSubIndex: subIndices.ozone ?? null,
      statusText: statusFromSub(subIndices.ozone ?? null),
      description: 'Secondary photochemical smog formed when sunlight reacts with traffic fumes.',
    },
    {
      key: 'sulphur_dioxide',
      label: 'Sulphur Dioxide',
      shortName: 'SO2',
      value: raw.sulphur_dioxide,
      unit: 'μg/m³',
      cpcbSubIndex: subIndices.sulphur_dioxide ?? null,
      statusText: statusFromSub(subIndices.sulphur_dioxide ?? null),
      description: 'Industrial and coal-burning emission linked to respiratory irritation.',
    },
    {
      key: 'carbon_monoxide',
      label: 'Carbon Monoxide',
      shortName: 'CO',
      value: raw.carbon_monoxide,
      unit: 'μg/m³',
      cpcbSubIndex: subIndices.carbon_monoxide ?? null,
      statusText: statusFromSub(subIndices.carbon_monoxide ?? null),
      description: 'Colorless gas from incomplete combustion; reduces oxygen delivery.',
    },
  ];
}

function getArrayElement(arr: unknown, idx: number): unknown {
  return Array.isArray(arr) ? arr[idx] : undefined;
}

export function normalizeOpenMeteoPayload(
  location: CityLocation,
  payload: unknown,
  nowMs: number = Date.now()
): NormalizedAqiData {
  if (!isRecord(payload) || !isRecord(payload.current)) {
    throw new Error('Malformed Open-Meteo payload: missing current object.');
  }

  const current = payload.current;
  const timestamp =
    typeof current.time === 'string' && current.time.trim().length > 0
      ? current.time.trim()
      : new Date(nowMs).toISOString();

  const rawValues = {
    pm2_5: sanitizeNumericReading(current.pm2_5),
    pm10: sanitizeNumericReading(current.pm10),
    carbon_monoxide: sanitizeNumericReading(current.carbon_monoxide),
    nitrogen_dioxide: sanitizeNumericReading(current.nitrogen_dioxide),
    sulphur_dioxide: sanitizeNumericReading(current.sulphur_dioxide),
    ozone: sanitizeNumericReading(current.ozone),
  };

  const cpcb = computeCpcbAqiFromPollutants(rawValues);
  const cpcbCat = classifyCpcbCategory(cpcb.value);

  const usVal = sanitizeNumericReading(current.us_aqi);
  const usCat = classifyUsEpaCategory(usVal);

  const euVal = sanitizeNumericReading(current.european_aqi);
  const euCat = classifyEuropeanCategory(euVal);

  const hourlyRaw = isRecord(payload.hourly) ? payload.hourly : {};
  const times: unknown[] = Array.isArray(hourlyRaw.time) ? hourlyRaw.time : [];
  const currentMs = Date.parse(timestamp.endsWith('Z') ? timestamp : `${timestamp}Z`);

  const hourly: HourlyDataPoint[] = [];
  for (let i = 0; i < times.length; i += 1) {
    const t = typeof times[i] === 'string' ? (times[i] as string).trim() : '';
    if (!t) continue;
    const tMs = Date.parse(t.endsWith('Z') ? t : `${t}Z`);
    const isForecast = Number.isFinite(currentMs) && Number.isFinite(tMs) ? tMs > currentMs : false;

    const pValues = {
      pm2_5: sanitizeNumericReading(getArrayElement(hourlyRaw.pm2_5, i)),
      pm10: sanitizeNumericReading(getArrayElement(hourlyRaw.pm10, i)),
      carbon_monoxide: sanitizeNumericReading(getArrayElement(hourlyRaw.carbon_monoxide, i)),
      nitrogen_dioxide: sanitizeNumericReading(getArrayElement(hourlyRaw.nitrogen_dioxide, i)),
      sulphur_dioxide: sanitizeNumericReading(getArrayElement(hourlyRaw.sulphur_dioxide, i)),
      ozone: sanitizeNumericReading(getArrayElement(hourlyRaw.ozone, i)),
    };

    const hCpcb = computeCpcbAqiFromPollutants(pValues);

    hourly.push({
      time: t,
      isForecast,
      usAqi: sanitizeNumericReading(getArrayElement(hourlyRaw.us_aqi, i)),
      europeanAqi: sanitizeNumericReading(getArrayElement(hourlyRaw.european_aqi, i)),
      cpcbAqi: hCpcb.value,
      pm2_5: pValues.pm2_5,
      pm10: pValues.pm10,
      nitrogen_dioxide: pValues.nitrogen_dioxide,
      ozone: pValues.ozone,
      sulphur_dioxide: pValues.sulphur_dioxide,
      carbon_monoxide: pValues.carbon_monoxide,
    });
  }

  return {
    location,
    timestamp,
    fetchedAt: new Date(nowMs).toISOString(),
    isStale: isTimestampStale(timestamp, nowMs),
    dataOrigin: 'live_api_estimate',
    sourceName: 'Open-Meteo Air Quality API (CAMS Global Atmospheric Model)',
    sourceUrl: 'https://open-meteo.com/en/docs/air-quality-api',
    indices: {
      cpcb: {
        value: cpcb.value,
        category: cpcbCat.category,
        categoryKey: cpcbCat.categoryKey,
        dominantPollutant: cpcb.dominantPollutant,
        status: cpcb.status,
        note:
          cpcb.status === 'computed'
            ? 'Estimated CPCB-style NAQI from hourly gridded CAMS model concentrations (CO converted μg/m³ → mg/m³). Official regulatory CPCB NAQI uses 24-hour station averages.'
            : 'Insufficient modelled pollutant readings (requires ≥3 pollutants including PM2.5 or PM10) to estimate CPCB NAQI.',
      },
      usEpa: {
        value: usVal !== null ? Math.round(usVal) : null,
        category: usCat.category,
        categoryKey: usCat.categoryKey,
      },
      european: {
        value: euVal !== null ? Math.round(euVal) : null,
        category: euCat.category,
        categoryKey: euCat.categoryKey,
      },
    },
    pollutants: buildPollutantReadings(rawValues, cpcb.subIndices),
    hourly,
  };
}

function setBoundedCache(key: string, entry: CacheEntry, now: number): void {
  for (const [existingKey, existingVal] of memoryCache.entries()) {
    if (existingVal.expiresAt <= now) {
      memoryCache.delete(existingKey);
    }
  }
  while (memoryCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = memoryCache.keys().next().value;
    if (!oldestKey) break;
    memoryCache.delete(oldestKey);
  }
  memoryCache.set(key, entry);
}

export async function fetchOpenMeteoAqi(
  location: CityLocation,
  options?: {
    fetchImpl?: typeof fetch;
    getCachedSnapshot?: (locationId: string) => NormalizedAqiData | null;
    saveSnapshot?: (data: NormalizedAqiData) => void;
    bypassCache?: boolean;
  }
): Promise<NormalizedAqiData> {
  const cacheKey = `${location.latitude.toFixed(3)},${location.longitude.toFixed(3)}`;
  const now = Date.now();

  if (!options?.bypassCache) {
    const cached = memoryCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return {
        ...cached.data,
        location,
      };
    }

    const existingInflight = inflightRequests.get(cacheKey);
    if (existingInflight) {
      const result = await existingInflight;
      return { ...result, location };
    }
  }

  const runFetch = async (): Promise<NormalizedAqiData> => {
    const fetchFn = options?.fetchImpl ?? fetch;
    const params = new URLSearchParams({
      latitude: String(location.latitude),
      longitude: String(location.longitude),
      current:
        'us_aqi,european_aqi,pm2_5,pm10,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone',
      hourly:
        'us_aqi,european_aqi,pm2_5,pm10,carbon_monoxide,nitrogen_dioxide,sulphur_dioxide,ozone',
      past_days: '2',
      forecast_days: '2',
      timezone: 'UTC',
    });

    try {
      const res = await fetchFn(`${OPEN_METEO_AQI_URL}?${params.toString()}`, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { Accept: 'application/json' },
      });

      if (!res.ok) {
        throw new Error(`Upstream provider returned HTTP ${res.status}`);
      }

      const json: unknown = await res.json();
      const normalized = normalizeOpenMeteoPayload(location, json, Date.now());
      setBoundedCache(
        cacheKey,
        {
          expiresAt: Date.now() + CACHE_TTL_MS,
          data: normalized,
        },
        Date.now()
      );

      try {
        options?.saveSnapshot?.(normalized);
      } catch {
        // Non-fatal: snapshot persistence failure should not discard live response
      }
      return normalized;
    } catch {
      let snapshot: NormalizedAqiData | null = null;
      try {
        snapshot = options?.getCachedSnapshot?.(location.id) ?? null;
      } catch {
        snapshot = null;
      }

      if (snapshot) {
        return {
          ...snapshot,
          location,
          dataOrigin: 'cached_snapshot',
          isStale: true,
          errorMessage:
            'Live model feed is temporarily unreachable. Showing the most recent cached model estimate.',
        };
      }

      return {
        location,
        timestamp: '',
        fetchedAt: new Date(Date.now()).toISOString(),
        isStale: true,
        dataOrigin: 'unavailable',
        sourceName: 'Open-Meteo Air Quality API (Unavailable)',
        sourceUrl: 'https://open-meteo.com/en/docs/air-quality-api',
        indices: {
          cpcb: {
            value: null,
            category: 'Unavailable',
            categoryKey: 'unavailable',
            dominantPollutant: null,
            status: 'insufficient_data',
            note: 'Modelled air quality estimates are currently unavailable.',
          },
          usEpa: {
            value: null,
            category: 'Unavailable',
            categoryKey: 'unavailable',
          },
          european: {
            value: null,
            category: 'Unavailable',
            categoryKey: 'unavailable',
          },
        },
        pollutants: buildPollutantReadings(
          {
            pm2_5: null,
            pm10: null,
            carbon_monoxide: null,
            nitrogen_dioxide: null,
            sulphur_dioxide: null,
            ozone: null,
          },
          {}
        ),
        hourly: [],
        errorMessage:
          'Unable to retrieve air quality model estimates from Open-Meteo right now. Please retry shortly.',
      };
    }
  };

  if (options?.bypassCache) {
    return runFetch();
  }

  const promise = runFetch().finally(() => {
    inflightRequests.delete(cacheKey);
  });
  inflightRequests.set(cacheKey, promise);
  return promise;
}

export function clearAqiMemoryCache(): void {
  memoryCache.clear();
  inflightRequests.clear();
}
