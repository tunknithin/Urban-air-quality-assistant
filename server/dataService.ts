import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { CityLocation, CommunityReport, NormalizedAqiData } from '../shared/types.ts';
import type { ValidatedReportInput } from './validation.ts';

const MAX_COMMUNITY_REPORTS = 500;
const MAX_SNAPSHOT_ROWS = 200;
const DUPLICATE_WINDOW_MS = 5 * 60 * 1000;

export class DuplicateReportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DuplicateReportError';
  }
}

export class DatabaseOperationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DatabaseOperationError';
  }
}

export const CURATED_LOCATIONS: CityLocation[] = [
  {
    id: 'in-delhi',
    name: 'New Delhi',
    region: 'Delhi NCR',
    country: 'India',
    latitude: 28.6139,
    longitude: 77.209,
    isDefaultIndian: true,
  },
  {
    id: 'in-mumbai',
    name: 'Mumbai',
    region: 'Maharashtra',
    country: 'India',
    latitude: 19.076,
    longitude: 72.8777,
    isDefaultIndian: true,
  },
  {
    id: 'in-bengaluru',
    name: 'Bengaluru',
    region: 'Karnataka',
    country: 'India',
    latitude: 12.9716,
    longitude: 77.5946,
    isDefaultIndian: true,
  },
  {
    id: 'in-chennai',
    name: 'Chennai',
    region: 'Tamil Nadu',
    country: 'India',
    latitude: 13.0827,
    longitude: 80.2707,
    isDefaultIndian: true,
  },
  {
    id: 'in-kolkata',
    name: 'Kolkata',
    region: 'West Bengal',
    country: 'India',
    latitude: 22.5726,
    longitude: 88.3639,
    isDefaultIndian: true,
  },
  {
    id: 'in-hyderabad',
    name: 'Hyderabad',
    region: 'Telangana',
    country: 'India',
    latitude: 17.385,
    longitude: 78.4867,
    isDefaultIndian: true,
  },
  {
    id: 'in-pune',
    name: 'Pune',
    region: 'Maharashtra',
    country: 'India',
    latitude: 18.5204,
    longitude: 73.8567,
    isDefaultIndian: true,
  },
  {
    id: 'in-ahmedabad',
    name: 'Ahmedabad',
    region: 'Gujarat',
    country: 'India',
    latitude: 23.0225,
    longitude: 72.5714,
    isDefaultIndian: true,
  },
  {
    id: 'in-jaipur',
    name: 'Jaipur',
    region: 'Rajasthan',
    country: 'India',
    latitude: 26.9124,
    longitude: 75.7873,
    isDefaultIndian: true,
  },
  {
    id: 'gb-london',
    name: 'London',
    region: 'Greater London',
    country: 'United Kingdom',
    latitude: 51.5072,
    longitude: -0.1276,
  },
  {
    id: 'jp-tokyo',
    name: 'Tokyo',
    region: 'Kanto',
    country: 'Japan',
    latitude: 35.6762,
    longitude: 139.6503,
  },
  {
    id: 'us-nyc',
    name: 'New York',
    region: 'New York',
    country: 'United States',
    latitude: 40.7128,
    longitude: -74.006,
  },
];

const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';

export class DataService {
  private db: DatabaseSync;

  constructor(dbPath?: string) {
    const configured = dbPath ?? process.env.DB_PATH?.trim() ?? '';
    const resolvedPath =
      configured === ':memory:'
        ? ':memory:'
        : configured.length > 0
        ? path.resolve(process.cwd(), configured)
        : path.resolve(process.cwd(), 'data', 'uaqa.db');

    if (resolvedPath !== ':memory:') {
      fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    }
    this.db = new DatabaseSync(resolvedPath);
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS aqi_snapshots (
        location_id TEXT PRIMARY KEY,
        payload_json TEXT NOT NULL,
        fetched_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_snapshots_fetched_at
        ON aqi_snapshots (fetched_at DESC);

      CREATE TABLE IF NOT EXISTS community_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        location_name TEXT NOT NULL,
        latitude REAL,
        longitude REAL,
        category TEXT NOT NULL,
        severity TEXT NOT NULL,
        description TEXT NOT NULL,
        created_at TEXT NOT NULL,
        verified INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_reports_created_at
        ON community_reports (created_at DESC);

      CREATE INDEX IF NOT EXISTS idx_reports_dedupe
        ON community_reports (location_name, category, created_at DESC);
    `);
  }

  public getLocationById(id: string): CityLocation | undefined {
    return CURATED_LOCATIONS.find((loc) => loc.id === id);
  }

  public saveAqiSnapshot(data: NormalizedAqiData): void {
    try {
      const insertStmt = this.db.prepare(`
        INSERT INTO aqi_snapshots (location_id, payload_json, fetched_at)
        VALUES (?, ?, ?)
        ON CONFLICT(location_id) DO UPDATE SET
          payload_json = excluded.payload_json,
          fetched_at = excluded.fetched_at
      `);
      insertStmt.run(data.location.id, JSON.stringify(data), data.fetchedAt);

      const pruneStmt = this.db.prepare(`
        DELETE FROM aqi_snapshots
        WHERE location_id NOT IN (
          SELECT location_id FROM aqi_snapshots ORDER BY fetched_at DESC LIMIT ?
        )
      `);
      pruneStmt.run(MAX_SNAPSHOT_ROWS);
    } catch {
      throw new DatabaseOperationError('Failed to persist air quality snapshot.');
    }
  }

  public getAqiSnapshot(locationId: string): NormalizedAqiData | null {
    try {
      const stmt = this.db.prepare(`
        SELECT payload_json FROM aqi_snapshots WHERE location_id = ?
      `);
      const row = stmt.get(locationId) as { payload_json?: string } | undefined;
      if (!row?.payload_json) return null;
      return JSON.parse(row.payload_json) as NormalizedAqiData;
    } catch {
      return null;
    }
  }

  public listCommunityReports(limit: number = 50): CommunityReport[] {
    try {
      const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
      const stmt = this.db.prepare(`
        SELECT id, location_name, latitude, longitude, category, severity, description, created_at, verified
        FROM community_reports
        ORDER BY id DESC
        LIMIT ?
      `);
      const rows = stmt.all(safeLimit) as Array<{
        id: number;
        location_name: string;
        latitude: number | null;
        longitude: number | null;
        category: CommunityReport['category'];
        severity: CommunityReport['severity'];
        description: string;
        created_at: string;
        verified: number;
      }>;

      return rows.map((row) => ({
        id: row.id,
        locationName: row.location_name,
        latitude: row.latitude,
        longitude: row.longitude,
        category: row.category,
        severity: row.severity,
        description: row.description,
        createdAt: row.created_at,
        verified: row.verified === 1,
      }));
    } catch {
      throw new DatabaseOperationError('Unable to load community reports.');
    }
  }

  public createCommunityReport(input: ValidatedReportInput): CommunityReport {
    try {
      const nowMs = Date.now();
      const createdAt = new Date(nowMs).toISOString();
      const cutoffIso = new Date(nowMs - DUPLICATE_WINDOW_MS).toISOString();

      this.db.exec('BEGIN IMMEDIATE');
      try {
        const dupStmt = this.db.prepare(`
          SELECT id FROM community_reports
          WHERE lower(location_name) = lower(?)
            AND category = ?
            AND lower(description) = lower(?)
            AND created_at >= ?
          LIMIT 1
        `);
        const existing = dupStmt.get(
          input.locationName,
          input.category,
          input.description,
          cutoffIso
        ) as { id?: number } | undefined;

        if (existing?.id) {
          this.db.exec('ROLLBACK');
          throw new DuplicateReportError(
            'A matching observation for this location was already submitted recently.'
          );
        }

        const insertStmt = this.db.prepare(`
          INSERT INTO community_reports (
            location_name, latitude, longitude, category, severity, description, created_at, verified
          ) VALUES (?, ?, ?, ?, ?, ?, ?, 0)
        `);
        const result = insertStmt.run(
          input.locationName,
          input.latitude,
          input.longitude,
          input.category,
          input.severity,
          input.description,
          createdAt
        );

        const pruneStmt = this.db.prepare(`
          DELETE FROM community_reports
          WHERE id NOT IN (
            SELECT id FROM community_reports ORDER BY id DESC LIMIT ?
          )
        `);
        pruneStmt.run(MAX_COMMUNITY_REPORTS);

        this.db.exec('COMMIT');

        return {
          id: Number(result.lastInsertRowid),
          locationName: input.locationName,
          latitude: input.latitude,
          longitude: input.longitude,
          category: input.category,
          severity: input.severity,
          description: input.description,
          createdAt,
          verified: false,
        };
      } catch (innerErr) {
        if (innerErr instanceof DuplicateReportError) {
          throw innerErr;
        }
        try {
          this.db.exec('ROLLBACK');
        } catch {
          // ignore rollback error
        }
        throw new DatabaseOperationError('Unable to store community report.');
      }
    } catch (err) {
      if (err instanceof DuplicateReportError || err instanceof DatabaseOperationError) {
        throw err;
      }
      throw new DatabaseOperationError('Unable to store community report.');
    }
  }

  public close(): void {
    try {
      this.db.close();
    } catch {
      // ignore close errors
    }
  }
}

export async function searchLocations(
  query: string,
  fetchImpl: typeof fetch = fetch
): Promise<CityLocation[]> {
  const lower = query.toLowerCase();
  const localMatches = CURATED_LOCATIONS.filter(
    (loc) =>
      loc.name.toLowerCase().includes(lower) ||
      loc.region.toLowerCase().includes(lower) ||
      loc.country.toLowerCase().includes(lower)
  );

  try {
    const params = new URLSearchParams({
      name: query,
      count: '6',
      language: 'en',
      format: 'json',
    });
    const res = await fetchImpl(`${GEOCODING_URL}?${params.toString()}`, {
      signal: AbortSignal.timeout(5000),
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return localMatches;
    const json: unknown = await res.json();
    if (!json || typeof json !== 'object' || !Array.isArray((json as { results?: unknown }).results)) {
      return localMatches;
    }

    const rawResults = (json as { results: unknown[] }).results;
    const remote: CityLocation[] = [];

    for (const item of rawResults) {
      if (!item || typeof item !== 'object') continue;
      const r = item as Record<string, unknown>;
      if (
        typeof r.name === 'string' &&
        typeof r.latitude === 'number' &&
        Number.isFinite(r.latitude) &&
        typeof r.longitude === 'number' &&
        Number.isFinite(r.longitude)
      ) {
        remote.push({
          id: `geo-${typeof r.id === 'number' ? r.id : `${r.latitude}-${r.longitude}`}`,
          name: r.name,
          region: typeof r.admin1 === 'string' ? r.admin1 : typeof r.country === 'string' ? r.country : 'Urban Area',
          country: typeof r.country === 'string' ? r.country : 'Global',
          latitude: Number(r.latitude.toFixed(4)),
          longitude: Number(r.longitude.toFixed(4)),
        });
      }
    }

    const merged: CityLocation[] = [...localMatches];
    for (const item of remote) {
      const duplicate = merged.some(
        (m) =>
          Math.abs(m.latitude - item.latitude) < 0.08 &&
          Math.abs(m.longitude - item.longitude) < 0.08
      );
      if (!duplicate) merged.push(item);
    }
    return merged.slice(0, 8);
  } catch {
    return localMatches;
  }
}
