import type { AqiStandard } from '../shared/types.ts';

export const REPORT_CATEGORIES = [
  'Smoke',
  'Road Dust',
  'Waste Burning',
  'Industrial Emissions',
  'Traffic Haze',
] as const;

export const REPORT_SEVERITIES = ['Low', 'Moderate', 'High'] as const;
export const VALID_STANDARDS: readonly AqiStandard[] = ['cpcb', 'us_epa', 'european'];

export type ReportCategory = (typeof REPORT_CATEGORIES)[number];
export type ReportSeverity = (typeof REPORT_SEVERITIES)[number];

export interface ValidationResult<T> {
  valid: boolean;
  data?: T;
  error?: string;
}

export function stripHtmlTags(input: string): string {
  return input
    .replace(/<[^>]*>/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim();
}

function parseStrictFiniteNumber(raw: unknown): number | null {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? raw : null;
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.length === 0) return null; // Reject empty string rather than letting Number('') === 0
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function validateCoordinates(
  latRaw: unknown,
  lonRaw: unknown
): ValidationResult<{ latitude: number; longitude: number }> {
  const latitude = parseStrictFiniteNumber(latRaw);
  const longitude = parseStrictFiniteNumber(lonRaw);

  if (latitude === null || longitude === null) {
    return { valid: false, error: 'Latitude and longitude must be valid non-empty numbers.' };
  }
  if (latitude < -90 || latitude > 90) {
    return { valid: false, error: 'Latitude must be between -90 and 90 degrees.' };
  }
  if (longitude < -180 || longitude > 180) {
    return { valid: false, error: 'Longitude must be between -180 and 180 degrees.' };
  }

  return {
    valid: true,
    data: {
      latitude: Number(latitude.toFixed(4)),
      longitude: Number(longitude.toFixed(4)),
    },
  };
}

export function validateLocationId(raw: unknown): ValidationResult<string> {
  if (typeof raw !== 'string') {
    return { valid: false, error: 'Location ID must be a string.' };
  }
  const trimmed = raw.trim();
  if (!/^[a-zA-Z0-9._-]{2,64}$/.test(trimmed)) {
    return { valid: false, error: 'Location ID format is invalid.' };
  }
  return { valid: true, data: trimmed };
}

export function validateStandard(raw: unknown): ValidationResult<AqiStandard> {
  if (raw === undefined || raw === null || raw === '') {
    return { valid: true, data: 'cpcb' };
  }
  if (typeof raw !== 'string' || !VALID_STANDARDS.includes(raw as AqiStandard)) {
    return {
      valid: false,
      error: 'Invalid AQI standard. Allowed values are cpcb, us_epa, or european.',
    };
  }
  return { valid: true, data: raw as AqiStandard };
}

export function validateCityQuery(raw: unknown): ValidationResult<string> {
  if (typeof raw !== 'string') {
    return { valid: false, error: 'Search query must be a string.' };
  }
  const cleaned = stripHtmlTags(raw).replace(/\s+/g, ' ');
  if (cleaned.length < 2) {
    return { valid: false, error: 'Enter at least 2 characters to search for a city.' };
  }
  if (cleaned.length > 80) {
    return { valid: false, error: 'Search query must be 80 characters or fewer.' };
  }
  if (!/^[\p{L}\p{N}\s,.'-]+$/u.test(cleaned)) {
    return { valid: false, error: 'Search query contains unsupported characters.' };
  }
  return { valid: true, data: cleaned };
}

export function validateAssistantQuestion(raw: unknown): ValidationResult<string> {
  if (typeof raw !== 'string') {
    return { valid: false, error: 'Question must be text.' };
  }
  const cleaned = stripHtmlTags(raw).replace(/\s+/g, ' ');
  if (cleaned.length < 3) {
    return { valid: false, error: 'Please ask a question with at least 3 characters.' };
  }
  if (cleaned.length > 600) {
    return { valid: false, error: 'Question must be 600 characters or fewer.' };
  }
  return { valid: true, data: cleaned };
}

export function sanitizePromptInput(question: string): string {
  return question
    .replace(/[<>]/g, '')
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function validateReportLimit(raw: unknown): ValidationResult<number> {
  if (raw === undefined || raw === null || raw === '') {
    return { valid: true, data: 50 };
  }
  const parsed = parseStrictFiniteNumber(raw);
  if (parsed === null || !Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    return { valid: false, error: 'Limit must be an integer between 1 and 100.' };
  }
  return { valid: true, data: parsed };
}

export interface ValidatedReportInput {
  locationName: string;
  latitude: number | null;
  longitude: number | null;
  category: ReportCategory;
  severity: ReportSeverity;
  description: string;
}

export function validateCommunityReport(payload: unknown): ValidationResult<ValidatedReportInput> {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { valid: false, error: 'Report payload must be a JSON object.' };
  }

  const record = payload as Record<string, unknown>;
  const locationName =
    typeof record.locationName === 'string' ? stripHtmlTags(record.locationName) : '';
  const description =
    typeof record.description === 'string' ? stripHtmlTags(record.description) : '';
  const category = record.category;
  const severity = record.severity;

  if (locationName.length < 2 || locationName.length > 80) {
    return { valid: false, error: 'Location name must be between 2 and 80 characters.' };
  }

  if (typeof category !== 'string' || !REPORT_CATEGORIES.includes(category as ReportCategory)) {
    return { valid: false, error: 'Invalid pollution category selected.' };
  }

  if (typeof severity !== 'string' || !REPORT_SEVERITIES.includes(severity as ReportSeverity)) {
    return { valid: false, error: 'Invalid severity level selected.' };
  }

  if (description.length < 10 || description.length > 400) {
    return { valid: false, error: 'Description must be between 10 and 400 characters.' };
  }

  const latOmitted = record.latitude === undefined || record.latitude === null;
  const lonOmitted = record.longitude === undefined || record.longitude === null;

  let latitude: number | null = null;
  let longitude: number | null = null;

  if (!latOmitted || !lonOmitted) {
    // Require both coordinates when either is provided (rejects one-sided or empty string coords)
    if (latOmitted || lonOmitted) {
      return {
        valid: false,
        error: 'Provide both latitude and longitude, or omit both.',
      };
    }
    const coordCheck = validateCoordinates(record.latitude, record.longitude);
    if (!coordCheck.valid || !coordCheck.data) {
      return { valid: false, error: coordCheck.error };
    }
    latitude = coordCheck.data.latitude;
    longitude = coordCheck.data.longitude;
  }

  return {
    valid: true,
    data: {
      locationName,
      latitude,
      longitude,
      category: category as ReportCategory,
      severity: severity as ReportSeverity,
      description,
    },
  };
}
