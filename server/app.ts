import express from 'express';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import helmet from 'helmet';
import { isIP } from 'node:net';
import type {
  AqiStandard,
  AssistantReply,
  CityLocation,
  NormalizedAqiData,
  SmartRecommendation,
} from '../shared/types.ts';
import { fetchOpenMeteoAqi } from './aqiService.ts';
import { askAirQualityAssistant } from './aiAssistant.ts';
import {
  CURATED_LOCATIONS,
  DatabaseOperationError,
  DataService,
  DuplicateReportError,
  searchLocations,
} from './dataService.ts';
import { generateRecommendations } from './recommendation.ts';
import {
  stripHtmlTags,
  validateAssistantQuestion,
  validateCityQuery,
  validateCommunityReport,
  validateCoordinates,
  validateLocationId,
  validateReportLimit,
  validateStandard,
} from './validation.ts';

export interface ApiAppDependencies {
  dataService?: DataService;
  isProduction?: boolean;
  fetchAqiFn?: (
    location: CityLocation,
    options?: {
      bypassCache?: boolean;
      getCachedSnapshot?: (id: string) => NormalizedAqiData | null;
      saveSnapshot?: (snapshot: NormalizedAqiData) => void;
    }
  ) => Promise<NormalizedAqiData>;
  searchLocationsFn?: (query: string) => Promise<CityLocation[]>;
  askAssistantFn?: (
    question: string,
    aqiData: NormalizedAqiData,
    recommendation: SmartRecommendation,
    standard: AqiStandard
  ) => Promise<AssistantReply>;
  rateLimits?: {
    aqiMax?: number;
    assistantMax?: number;
    reportsPostMax?: number;
    reportsGetMax?: number;
    searchMax?: number;
  };
}

export function parseTrustProxy(raw: string | undefined): number | boolean {
  if (!raw || raw.trim() === '') {
    // Cloud Run and AI Studio preview sit behind a single reverse proxy hop by default
    return 1;
  }
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === 'false' || trimmed === '0') {
    return false;
  }
  if (/^\d+$/.test(trimmed)) {
    const hops = Number(trimmed);
    return hops > 0 ? Math.min(hops, 5) : false;
  }
  // Never accept arbitrary 'true' which trusts spoofed X-Forwarded-For chains
  return 1;
}

export function extractRightmostForwardedIp(headerValue: string, hops = 1): string | null {
  const entries = headerValue
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (entries.length === 0) return null;

  const targetIndex = Math.max(0, entries.length - Math.max(1, hops));
  const targetEntry = entries[targetIndex];
  const forMatch = targetEntry.match(/(?:^|;)\s*for=([^;]+)/i);
  if (!forMatch) return null;

  let candidate = forMatch[1].trim().replace(/^"|"$/g, '');
  if (candidate.startsWith('[')) {
    const closingIdx = candidate.indexOf(']');
    if (closingIdx === -1) return null;
    candidate = candidate.slice(1, closingIdx);
  } else {
    // Strip optional IPv4 :port suffix (leave unbracketed IPv6 intact)
    const lastColon = candidate.lastIndexOf(':');
    if (lastColon > 0 && candidate.indexOf(':') === lastColon) {
      candidate = candidate.slice(0, lastColon);
    }
  }

  return isIP(candidate) !== 0 ? candidate : null;
}

function extractClientIp(req: express.Request, trustProxy: number | boolean): string {
  const socketIp = req.socket?.remoteAddress ?? '';
  if (trustProxy !== false) {
    if (req.ip && req.ip !== socketIp) {
      return req.ip;
    }
    const forwardedRaw = req.headers.forwarded;
    const forwardedHeader = Array.isArray(forwardedRaw) ? forwardedRaw.join(', ') : forwardedRaw;
    if (typeof forwardedHeader === 'string' && forwardedHeader.trim().length > 0) {
      const hops = typeof trustProxy === 'number' ? trustProxy : 1;
      const parsed = extractRightmostForwardedIp(forwardedHeader, hops);
      if (parsed) return parsed;
    }
  }
  return req.ip || socketIp || '127.0.0.1';
}

function resolveLocationInput(
  input: Record<string, unknown>,
  dataService: DataService
): { location?: CityLocation; statusCode?: number; error?: string } {
  const hasLocationId =
    input.locationId !== undefined && input.locationId !== null && String(input.locationId).trim() !== '';
  const hasLat = input.lat !== undefined && input.lat !== null;
  const hasLon = input.lon !== undefined && input.lon !== null;

  if (hasLocationId) {
    const idCheck = validateLocationId(String(input.locationId));
    if (!idCheck.valid || !idCheck.data) {
      return { statusCode: 400, error: idCheck.error ?? 'Invalid locationId.' };
    }

    const curated = dataService.getLocationById(idCheck.data);
    if (curated) {
      return { location: curated };
    }

    // Geocoded / custom coordinates passed alongside a geo-/custom- ID
    if (hasLat || hasLon) {
      if (!hasLat || !hasLon) {
        return { statusCode: 400, error: 'Provide both lat and lon coordinates.' };
      }
      const coordCheck = validateCoordinates(input.lat, input.lon);
      if (!coordCheck.valid || !coordCheck.data) {
        return { statusCode: 400, error: coordCheck.error };
      }
      const name =
        typeof input.name === 'string' && stripHtmlTags(input.name).length > 0
          ? stripHtmlTags(input.name).slice(0, 60)
          : 'Selected City';
      const region =
        typeof input.region === 'string' && stripHtmlTags(input.region).length > 0
          ? stripHtmlTags(input.region).slice(0, 60)
          : 'Urban Area';
      const country =
        typeof input.country === 'string' && stripHtmlTags(input.country).length > 0
          ? stripHtmlTags(input.country).slice(0, 60)
          : 'Global';

      return {
        location: {
          id: idCheck.data,
          name,
          region,
          country,
          latitude: coordCheck.data.latitude,
          longitude: coordCheck.data.longitude,
        },
      };
    }

    // Explicitly reject unknown locationId instead of silently defaulting to Delhi
    return { statusCode: 404, error: `Unknown locationId '${idCheck.data}'.` };
  }

  if (hasLat || hasLon) {
    if (!hasLat || !hasLon) {
      return { statusCode: 400, error: 'Provide both lat and lon coordinates.' };
    }
    const coordCheck = validateCoordinates(input.lat, input.lon);
    if (!coordCheck.valid || !coordCheck.data) {
      return { statusCode: 400, error: coordCheck.error };
    }
    const name =
      typeof input.name === 'string' && stripHtmlTags(input.name).length > 0
        ? stripHtmlTags(input.name).slice(0, 60)
        : 'Custom Coordinates';
    const region =
      typeof input.region === 'string' && stripHtmlTags(input.region).length > 0
        ? stripHtmlTags(input.region).slice(0, 60)
        : 'Custom Pin';
    const country =
      typeof input.country === 'string' && stripHtmlTags(input.country).length > 0
        ? stripHtmlTags(input.country).slice(0, 60)
        : 'Global';

    return {
      location: {
        id: `custom-${coordCheck.data.latitude}-${coordCheck.data.longitude}`,
        name,
        region,
        country,
        latitude: coordCheck.data.latitude,
        longitude: coordCheck.data.longitude,
      },
    };
  }

  return { location: CURATED_LOCATIONS[0] };
}

function createLimiter(maxPerMinute: number, message: string, trustProxy: number | boolean) {
  return rateLimit({
    windowMs: 60_000,
    limit: maxPerMinute,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => ipKeyGenerator(extractClientIp(req, trustProxy)),
    message: { error: message },
  });
}

export function createApiApp(deps: ApiAppDependencies = {}): {
  app: express.Express;
  dataService: DataService;
} {
  const app = express();
  const dataService = deps.dataService ?? new DataService();
  const isProduction = deps.isProduction ?? process.env.NODE_ENV === 'production';

  const fetchAqiFn = deps.fetchAqiFn ?? fetchOpenMeteoAqi;
  const searchLocationsFn = deps.searchLocationsFn ?? searchLocations;
  const askAssistantFn = deps.askAssistantFn ?? askAirQualityAssistant;
  const trustProxy = parseTrustProxy(process.env.TRUST_PROXY);

  app.disable('x-powered-by');
  app.set('trust proxy', trustProxy);

  const scriptSrc = isProduction ? ["'self'"] : ["'self'", "'unsafe-inline'"];

  app.use(
    helmet({
      frameguard: false, // Controlled via CSP frame-ancestors so AI Studio preview iframe works safely
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      strictTransportSecurity: isProduction
        ? { maxAge: 15_552_000, includeSubDomains: true }
        : false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc,
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
          imgSrc: [
            "'self'",
            'data:',
            'https://tile.openstreetmap.org',
            'https://*.tile.openstreetmap.org',
          ],
          connectSrc: ["'self'"],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'self'", 'https://aistudio.google.com', 'https://*.google.com'],
          upgradeInsecureRequests: isProduction ? [] : null,
        },
      },
    })
  );

  app.use((_req, res, next) => {
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
  });

  app.use(express.json({ limit: '32kb' }));

  // Endpoint-specific rate limiters
  const aqiLimiter = createLimiter(
    deps.rateLimits?.aqiMax ?? 30,
    'Too many air quality data requests. Please wait a minute and try again.',
    trustProxy
  );
  const assistantLimiter = createLimiter(
    deps.rateLimits?.assistantMax ?? 5,
    'Too many AI assistant questions. Please wait a minute before asking again.',
    trustProxy
  );
  const reportsPostLimiter = createLimiter(
    deps.rateLimits?.reportsPostMax ?? 5,
    'Report submission limit reached. Please wait a minute before submitting again.',
    trustProxy
  );
  const reportsGetLimiter = createLimiter(
    deps.rateLimits?.reportsGetMax ?? 30,
    'Too many report feed requests. Please wait a minute and try again.',
    trustProxy
  );
  const searchLimiter = createLimiter(
    deps.rateLimits?.searchMax ?? 20,
    'Too many location searches. Please wait a minute and try again.',
    trustProxy
  );

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
      timestamp: new Date().toISOString(),
    });
  });

  app.get('/api/locations', (_req, res) => {
    res.json({ locations: CURATED_LOCATIONS });
  });

  app.get('/api/locations/search', searchLimiter, async (req, res) => {
    const check = validateCityQuery(req.query.q);
    if (!check.valid || !check.data) {
      res.status(400).json({ error: check.error });
      return;
    }
    const results = await searchLocationsFn(check.data);
    res.json({ locations: results });
  });

  app.get('/api/aqi', aqiLimiter, async (req, res) => {
    const stdCheck = validateStandard(req.query.standard);
    if (!stdCheck.valid || !stdCheck.data) {
      res.status(400).json({ error: stdCheck.error });
      return;
    }

    const resolved = resolveLocationInput(req.query as Record<string, unknown>, dataService);
    if (resolved.error || !resolved.location) {
      res.status(resolved.statusCode ?? 400).json({
        error: resolved.error ?? 'Invalid location parameters.',
      });
      return;
    }

    const bypassCache = req.query.refresh === '1';

    const aqi = await fetchAqiFn(resolved.location, {
      bypassCache,
      getCachedSnapshot: (id) => dataService.getAqiSnapshot(id),
      saveSnapshot: (snapshot) => dataService.saveAqiSnapshot(snapshot),
    });

    const recommendation = generateRecommendations(aqi, stdCheck.data);
    res.json({ aqi, recommendation });
  });

  app.get('/api/map/stations', aqiLimiter, async (_req, res) => {
    const stations = await Promise.all(
      CURATED_LOCATIONS.map(async (loc) => {
        const aqi = await fetchAqiFn(loc, {
          getCachedSnapshot: (id) => dataService.getAqiSnapshot(id),
          saveSnapshot: (snapshot) => dataService.saveAqiSnapshot(snapshot),
        });
        return {
          ...aqi,
          hourly: [],
        };
      })
    );
    res.json({ stations });
  });

  app.post('/api/assistant', assistantLimiter, async (req, res) => {
    const body = req.body as Record<string, unknown> | undefined;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      res.status(400).json({ error: 'Invalid request body.' });
      return;
    }

    const questionCheck = validateAssistantQuestion(body.question);
    if (!questionCheck.valid || !questionCheck.data) {
      res.status(400).json({ error: questionCheck.error });
      return;
    }

    const stdCheck = validateStandard(body.standard);
    if (!stdCheck.valid || !stdCheck.data) {
      res.status(400).json({ error: stdCheck.error });
      return;
    }

    const resolved = resolveLocationInput(body, dataService);
    if (resolved.error || !resolved.location) {
      res.status(resolved.statusCode ?? 400).json({ error: resolved.error ?? 'Invalid location.' });
      return;
    }

    const aqi = await fetchAqiFn(resolved.location, {
      getCachedSnapshot: (id) => dataService.getAqiSnapshot(id),
      saveSnapshot: (snapshot) => dataService.saveAqiSnapshot(snapshot),
    });
    const recommendation = generateRecommendations(aqi, stdCheck.data);
    const reply = await askAssistantFn(questionCheck.data, aqi, recommendation, stdCheck.data);

    res.json({ reply });
  });

  app.get('/api/reports', reportsGetLimiter, (req, res) => {
    const limitCheck = validateReportLimit(req.query.limit);
    if (!limitCheck.valid || limitCheck.data === undefined) {
      res.status(400).json({ error: limitCheck.error });
      return;
    }
    try {
      const reports = dataService.listCommunityReports(limitCheck.data);
      res.json({ reports });
    } catch (err) {
      if (err instanceof DatabaseOperationError) {
        res.status(503).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: 'Unable to retrieve community reports.' });
    }
  });

  app.post('/api/reports', reportsPostLimiter, (req, res) => {
    const validation = validateCommunityReport(req.body);
    if (!validation.valid || !validation.data) {
      res.status(400).json({ error: validation.error });
      return;
    }

    try {
      const created = dataService.createCommunityReport(validation.data);
      res.status(201).json({ report: created });
    } catch (err) {
      if (err instanceof DuplicateReportError) {
        res.status(409).json({ error: err.message });
        return;
      }
      if (err instanceof DatabaseOperationError) {
        res.status(503).json({ error: err.message });
        return;
      }
      res.status(500).json({ error: 'Unable to save community report.' });
    }
  });

  // Safe JSON syntax / oversized body / unexpected error handler (no stack traces leaked)
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction
    ): void => {
      if (err && typeof err === 'object') {
        const record = err as { type?: string; status?: number };
        if (record.type === 'entity.too.large' || record.status === 413) {
          res.status(413).json({ error: 'Request payload exceeds maximum allowed size.' });
          return;
        }
        if (record.type === 'entity.parse.failed' || record.status === 400) {
          res.status(400).json({ error: 'Malformed JSON request body.' });
          return;
        }
      }
      res.status(500).json({ error: 'Internal server error.' });
    }
  );

  return { app, dataService };
}
