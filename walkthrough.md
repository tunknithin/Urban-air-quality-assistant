# Security Summary

**Reviewed Files**: 24
**Issues Resolved**: 8

### Issues Resolved
| Area | File | Line | What Was Happening | Impact | Status | How It Was Fixed |
|---|---|---|---|---|---|---|
| Environment & Secret Hygiene | `.gitignore` | 13 | `.env.*` wildcard variants, `.playwright-cli/`, and local SQLite WAL/SHM artifacts were not all explicitly excluded. | High | Fixed | Hardened `.gitignore` to ignore `.env`, `.env.*`, `data/`, `*.db*`, `*.sqlite*`, `dist/`, `tmp/`, and `.playwright-cli/` while keeping `!.env.example` tracked. |
| Missing HTTP Security Headers | `server/app.ts` | 193 | Express served API and page responses without a Content Security Policy, HSTS, Referrer-Policy, or Permissions-Policy. | Medium | Fixed | Added `helmet` with a scoped CSP (`default-src 'self'`, `tile.openstreetmap.org`, Google Fonts, restricted `frame-ancestors`), `Permissions-Policy`, `Referrer-Policy`, and production HSTS. |
| Broad Single Rate Limiter | `server/app.ts` | 232 | A single 120 req/min limiter protected both cheap reads and expensive AI/write endpoints equally. | Medium | Fixed | Replaced with endpoint-specific `express-rate-limit` policies (`30/min` AQI & report reads, `20/min` city search, `5/min` AI assistant & report submissions) and bounded `parseTrustProxy`. |
| Permissive Coordinate & Query Parsing | `server/validation.ts` | 30 | `Number("") === 0` allowed empty coordinate strings to pass as `0°`, one-sided report coordinates were tolerated, and unknown `locationId` values silently fell back to New Delhi. | Medium | Fixed | Added `parseStrictFiniteNumber`, required both `lat` and `lon` when either is supplied, added `validateLocationId`/`validateStandard`/`validateReportLimit`, and returned HTTP `400`/`404` on invalid/unknown inputs. |
| Unbounded Cache & Duplicate Report Flooding | `server/aqiService.ts`, `server/dataService.ts` | 414, 264 | In-memory AQI cache had no max-entry cap or inflight dedupe, and SQLite lacked indexes, duplicate suppression, and row retention bounds. | Medium | Fixed | Added bounded LRU-style cache (`100` entries), `inflightRequests` deduplication, SQLite indexes, WAL mode, 5-minute transactional duplicate rejection (`409`), and retention caps (`500` reports, `200` snapshots). |
| Prompt Delimiter & Timeout Risks | `server/aiAssistant.ts` | 111 | User questions were interpolated without explicit delimiter stripping or an upper timeout guard on Gemini API calls. | Low | Fixed | Applied `sanitizePromptInput`, wrapped untrusted text inside `<user_question>` delimiters, enforced a 10-second `Promise.race` timeout, and returned deterministic fallback on empty/failed responses. |
| Unsafe Popup HTML Composition | `src/components/MapView.tsx` | 183 | Marker popups need safe rendering of dynamic city and pollutant text without string HTML interpolation. | Medium | Fixed | Constructed Leaflet popup content strictly via `document.createElement` and `.textContent` assignments rather than HTML string concatenation or `innerHTML`. |
| Stale Async UI State | `src/App.tsx` | 44 | Rapid city switching could allow slower earlier AQI responses to overwrite the newly selected city's display. | Low | Fixed | Added `AbortController` cancellation, `latestRequestIdRef` sequence checks, and clearing stale city AQI state while switching locations. |

### Safeguards Verified
| Area | File | How It's Protected |
|---|---|---|
| API Keys & Secrets | `server/aiAssistant.ts` | `GEMINI_API_KEY` is read exclusively from server-side `process.env` and never bundled into `src/` or returned in error payloads. |
| Database Queries | `server/dataService.ts` | Every SQLite read, write, duplicate check, and prune operation uses parameterized prepared statements via `node:sqlite`. |
| Payload & Error Handling | `server/app.ts` | Caps JSON bodies at `32kb` (`413`), rejects malformed JSON (`400`), and catches errors without returning stack traces or environment variables. |
| Safe Rendering | `scripts/check-code.mjs` | Static scan across all 24 TypeScript/TSX source files confirms zero uses of `dangerouslySetInnerHTML`, `innerHTML`, `eval`, `new Function`, or explicit `any`. |

---

## PoC Verification

### Permissive Coordinate & Unknown Location Bypass

#### Summary
| Field | Value |
|---|---|
| Issue Type | Permissive Input Parsing & Silent Fallback |
| Impact | Medium |
| Affected File | `server/validation.ts:30`, `server/app.ts:72` |
| Test Scenario | `GET /api/aqi?lat=&lon=77.2` and `GET /api/aqi?locationId=unknown-city` |

#### How It Was Fixed
Empty strings previously coerced to `0` under JavaScript `Number('')`, turning missing latitude inputs into `0°` Equator requests, while unrecognized `locationId` strings silently fell back to New Delhi. `parseStrictFiniteNumber` now explicitly rejects empty/whitespace strings and non-numeric types, and `resolveLocationInput` returns an explicit HTTP `404` for unknown `locationId` values without coordinates.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | `GET /api/aqi?lat=&lon=77.2` arrives at `/api/aqi` (`server/app.ts:275`). | Enters `resolveLocationInput` |
| 2 | `validateCoordinates('', '77.2')` calls `parseStrictFiniteNumber('')` (`server/validation.ts:34-36`), which sees `trimmed.length === 0` and returns `null`. | Empty string rejected (`400`) |
| 3 | `GET /api/aqi?locationId=unknown-city` passes regex in `validateLocationId`, misses `dataService.getLocationById`, has no `lat`/`lon`, and hits `server/app.ts:127`. | Returns HTTP `404` |

#### Conclusion
**Fix Verified** - Automated integration tests (`server/uaqa.test.ts:392-402`) confirm HTTP `400` and `404` responses without silent fallback to `0°` or New Delhi.

---

### Duplicate Report Flooding & Oversized Payloads

#### Summary
| Field | Value |
|---|---|
| Issue Type | Missing Write Throttling, Duplicate Check & Body Cap |
| Impact | Medium |
| Affected File | `server/app.ts:229`, `server/dataService.ts:264` |
| Test Scenario | Sending a `40 KB` JSON payload to `POST /api/reports`, then submitting identical reports within 5 minutes and exceeding `5/min`. |

#### How It Was Fixed
JSON body parsing is capped at `32kb` with a safe `413` handler, `POST /api/reports` uses a dedicated 5 req/min IP limiter, and `createCommunityReport` checks for matching `(location_name, category, description)` rows within the preceding 5 minutes inside a SQLite `BEGIN IMMEDIATE` transaction.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | `40 KB` payload hits `express.json({ limit: '32kb' })` (`server/app.ts:229`) and triggers the error handler at `server/app.ts:404`. | Returns HTTP `413` |
| 2 | Valid `POST /api/reports` stores record with `verified = 0` (`server/dataService.ts:297`) and returns `201`. | Persisted unverified |
| 3 | Immediate identical `POST /api/reports` hits `dupStmt` (`server/dataService.ts:272-291`) and rolls back with `DuplicateReportError`. | Returns HTTP `409` |
| 4 | Subsequent requests beyond `reportsPostMax` hit `reportsPostLimiter` (`server/app.ts:240`). | Returns HTTP `429` |

#### Conclusion
**Fix Verified** - Integration test `server/uaqa.test.ts:404-443` confirms `413`, `201`, `409`, and `429` enforcement end-to-end.

---

### Leaflet Map Popup Dynamic Text Injection

#### Summary
| Field | Value |
|---|---|
| Issue Type | DOM-Based Script Injection Risk in Map Popups |
| Impact | Medium |
| Affected File | `src/components/MapView.tsx:183-240`, `src/components/MapView.tsx:278-317` |
| Test Scenario | Rendering a location name containing `<img src=x onerror=alert(1)>` in a map marker or cluster popup. |

#### How It Was Fixed
Instead of building HTML strings for Leaflet `.bindPopup(...)`, `MapView.tsx` builds native DOM elements (`document.createElement('div')`) and assigns dynamic strings exclusively via `.textContent`.

#### Step-by-Step Trace
| Step | What Happens in the Code | Outcome |
|---|---|---|
| 1 | City or cluster station data arrives in `MapView.tsx` (`src/components/MapView.tsx:183`). | Enters popup builder |
| 2 | `title.textContent = ...` and `labelSpan.textContent = ...` assign text directly to DOM text nodes (`src/components/MapView.tsx:190, 299`). | Angle brackets rendered literally |
| 3 | Leaflet mounts the `HTMLElement` node inside the popup container (`src/components/MapView.tsx:242`). | **Handled Safely** |

#### Conclusion
**Fix Verified** - Dynamic city strings cannot execute markup or event handlers inside map popups.
