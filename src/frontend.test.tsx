import test from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import React from 'react';
import { createRoot } from 'react-dom/client';
import type { NormalizedAqiData, SmartRecommendation } from '../shared/types.ts';

function installGlobals(win: Window) {
  Object.assign(globalThis, {
    window: win,
    document: win.document,
    HTMLElement: win.HTMLElement,
    Element: win.Element,
    Node: win.Node,
    Event: win.Event,
    DOMException: win.DOMException,
    AbortController: win.AbortController,
    requestAnimationFrame: win.requestAnimationFrame.bind(win),
  });
}

const bootWindow = new Window({ url: 'http://localhost:3000/' });
installGlobals(bootWindow);

const { default: App } = await import('./App.tsx');
const { CommunityReportsView } = await import('./components/CommunityReportsView.tsx');
const { DashboardView } = await import('./components/DashboardView.tsx');
const { AssistantView } = await import('./components/AssistantView.tsx');

function setupDom() {
  const win = new Window({ url: 'http://localhost:3000/' });
  installGlobals(win);
  const container = win.document.createElement('div');
  win.document.body.appendChild(container);
  const root = createRoot(container as unknown as Element);
  return { win, container, root };
}

async function flush(ms = 40): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitFor<T>(fn: () => T | null | undefined, timeoutMs = 800): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const val = fn();
    if (val) return val;
    await flush(15);
  }
  const finalVal = fn();
  if (finalVal) return finalVal;
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}

function makeSamplePayload(cityName: string, id: string, aqiVal: number): {
  aqi: NormalizedAqiData;
  recommendation: SmartRecommendation;
} {
  return {
    aqi: {
      location: {
        id,
        name: cityName,
        region: 'Test Region',
        country: 'India',
        latitude: 28.61,
        longitude: 77.2,
      },
      timestamp: '2026-11-23T14:00',
      fetchedAt: '2026-11-23T14:05:00.000Z',
      isStale: false,
      dataOrigin: 'live_api_estimate',
      sourceName: 'Open-Meteo Air Quality API (CAMS Global Atmospheric Model)',
      sourceUrl: 'https://open-meteo.com/en/docs/air-quality-api',
      indices: {
        cpcb: {
          value: aqiVal,
          category: aqiVal <= 100 ? 'Satisfactory' : 'Moderate',
          categoryKey: aqiVal <= 100 ? 'satisfactory' : 'moderate',
          dominantPollutant: 'PM2.5',
          status: 'computed',
          note: 'Estimated CPCB-style NAQI from hourly gridded CAMS model concentrations.',
        },
        usEpa: { value: aqiVal + 20, category: 'Moderate', categoryKey: 'satisfactory' },
        european: { value: 45, category: 'Moderate', categoryKey: 'moderate' },
      },
      pollutants: [
        {
          key: 'pm2_5',
          label: 'Fine Particulate Matter',
          shortName: 'PM2.5',
          value: 45.2,
          unit: 'μg/m³',
          cpcbSubIndex: aqiVal,
          statusText: 'Satisfactory',
          description: 'Fine particles',
        },
        {
          key: 'pm10',
          label: 'Coarse Particulate Matter',
          shortName: 'PM10',
          value: null,
          unit: 'μg/m³',
          cpcbSubIndex: null,
          statusText: 'Unavailable',
          description: 'Coarse particles',
        },
      ],
      hourly: [],
    },
    recommendation: {
      standardUsed: 'cpcb',
      aqiValue: aqiVal,
      category: aqiVal <= 100 ? 'Satisfactory' : 'Moderate',
      categoryKey: aqiVal <= 100 ? 'satisfactory' : 'moderate',
      headline: `Test headline for ${cityName}`,
      outdoorActivity: {
        verdict: 'Moderate Caution',
        summary: 'Short outdoor trips are manageable.',
        activities: ['Walking'],
      },
      sensitiveGroups: {
        riskLevel: 'Elevated',
        guidance: 'Monitor respiratory comfort.',
      },
      indoorAlternatives: ['Indoor stretching'],
      precautions: ['Stay hydrated'],
      pollutionExplanation: 'Modelled surface concentrations shown.',
      forecastSummary: { available: false, message: 'Forecast unavailable.' },
    },
  };
}

test('DashboardView renders loading, error retry, and missing pollutant Unavailable states', async () => {
  const { container, root, win } = setupDom();
  let retried = false;

  try {
    root.render(
      React.createElement(DashboardView, {
        aqi: null,
        recommendation: null,
        standard: 'cpcb',
        onChangeStandard: () => {},
        loading: true,
        error: null,
        onRetry: () => {},
        onAskAssistant: () => {},
      })
    );
    await flush();
    assert.ok(container.querySelector('[aria-busy="true"]'));

    root.render(
      React.createElement(DashboardView, {
        aqi: null,
        recommendation: null,
        standard: 'cpcb',
        onChangeStandard: () => {},
        loading: false,
        error: 'Upstream timeout',
        onRetry: () => {
          retried = true;
        },
        onAskAssistant: () => {},
      })
    );
    await flush();
    const retryBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Retry Live Fetch')
    );
    assert.ok(retryBtn);
    retryBtn.click();
    assert.equal(retried, true);

    const sample = makeSamplePayload('New Delhi', 'in-delhi', 133);
    root.render(
      React.createElement(DashboardView, {
        aqi: sample.aqi,
        recommendation: sample.recommendation,
        standard: 'cpcb',
        onChangeStandard: () => {},
        loading: false,
        error: null,
        onRetry: () => {},
        onAskAssistant: () => {},
      })
    );
    await flush();
    assert.equal(container.querySelector('[data-testid="hero-aqi-value"]')?.textContent, '133');
    assert.ok(container.textContent?.includes('Live API Model Estimate'));
    assert.ok(container.textContent?.includes('Unavailable'));
  } finally {
    root.unmount();
    win.close();
  }
});

test('App cancels/ignores slower stale location responses when switching cities rapidly', async () => {
  const { container, root, win } = setupDom();
  const originalFetch = globalThis.fetch;

  const locations = [
    {
      id: 'in-delhi',
      name: 'New Delhi',
      region: 'Delhi NCR',
      country: 'India',
      latitude: 28.6139,
      longitude: 77.209,
    },
    {
      id: 'in-bengaluru',
      name: 'Bengaluru',
      region: 'Karnataka',
      country: 'India',
      latitude: 12.9716,
      longitude: 77.5946,
    },
  ];

  let resolveDelhi!: (value: Response) => void;
  let delhiCount = 0;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('/api/locations')) {
      return new Response(JSON.stringify({ locations }), { status: 200 });
    }
    if (url.includes('locationId=in-delhi')) {
      delhiCount += 1;
      if (delhiCount === 1) {
        return new Promise<Response>((resolve) => {
          resolveDelhi = resolve;
        });
      }
      return new Response(JSON.stringify(makeSamplePayload('New Delhi', 'in-delhi', 180)), {
        status: 200,
      });
    }
    if (url.includes('locationId=in-bengaluru')) {
      return new Response(JSON.stringify(makeSamplePayload('Bengaluru', 'in-bengaluru', 64)), {
        status: 200,
      });
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;

  try {
    root.render(React.createElement(App));

    // Wait for curated locations to load and render Bengaluru in the sidebar
    const bengaluruBtn = await waitFor(() =>
      Array.from(container.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Bengaluru')
      )
    );
    bengaluruBtn.click();

    // Bengaluru's AQI (64) should now be displayed
    const heroEl = await waitFor(() => {
      const el = container.querySelector('[data-testid="hero-aqi-value"]');
      return el?.textContent === '64' ? el : null;
    });
    assert.equal(heroEl.textContent, '64');

    // Now resolve the stale New Delhi promise late — it MUST NOT overwrite Bengaluru (64)!
    resolveDelhi(
      new Response(JSON.stringify(makeSamplePayload('New Delhi', 'in-delhi', 250)), { status: 200 })
    );
    await flush(60);

    assert.equal(container.querySelector('[data-testid="hero-aqi-value"]')?.textContent, '64');
    assert.ok(container.textContent?.includes('Test headline for Bengaluru'));
  } finally {
    globalThis.fetch = originalFetch;
    root.unmount();
    win.close();
  }
});

test('CommunityReportsView handles fetch errors, empty state, and form submission', async () => {
  const { container, root, win } = setupDom();
  const originalFetch = globalThis.fetch;

  let failGet = true;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url === '/api/reports' && (!init || init.method !== 'POST')) {
      if (failGet) {
        return new Response(JSON.stringify({ error: 'Database unavailable' }), { status: 503 });
      }
      return new Response(JSON.stringify({ reports: [] }), { status: 200 });
    }
    if (url === '/api/reports' && init?.method === 'POST') {
      return new Response(
        JSON.stringify({
          report: {
            id: 7,
            locationName: 'MG Road',
            latitude: 12.97,
            longitude: 77.59,
            category: 'Smoke',
            severity: 'High',
            description: 'Visible waste burning plume near metro exit.',
            createdAt: '2026-11-23T14:10:00.000Z',
            verified: false,
          },
        }),
        { status: 201 }
      );
    }
    return new Response('{}', { status: 404 });
  }) as typeof fetch;

  try {
    root.render(
      React.createElement(CommunityReportsView, {
        selectedLocation: {
          id: 'in-bengaluru',
          name: 'Bengaluru',
          region: 'Karnataka',
          country: 'India',
          latitude: 12.9716,
          longitude: 77.5946,
        },
      })
    );
    await flush(40);
    assert.ok(container.textContent?.includes('Database unavailable'));

    failGet = false;
    const retryBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Retry Load')
    );
    assert.ok(retryBtn);
    retryBtn.click();
    await flush(40);
    assert.ok(container.textContent?.includes('No community observations logged yet'));
  } finally {
    globalThis.fetch = originalFetch;
    root.unmount();
    win.close();
  }
});

test('AssistantView renders rule-based fallback reply cleanly', async () => {
  const { container, root, win } = setupDom();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        reply: {
          answer: 'Bengaluru AQI estimate is 64 (Satisfactory).',
          mode: 'rule_based_fallback',
          groundedInLocation: 'Bengaluru, India',
          groundedTimestamp: '2026-11-23T14:00',
          disclaimer: 'Rule-based advisory grounded in Open-Meteo CAMS model estimates.',
        },
      }),
      { status: 200 }
    )) as typeof fetch;

  try {
    const sample = makeSamplePayload('Bengaluru', 'in-bengaluru', 64);
    root.render(
      React.createElement(AssistantView, {
        selectedLocation: sample.aqi.location,
        standard: 'cpcb',
        aqi: sample.aqi,
      })
    );
    await flush(30);
    const promptBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Is it safe to go running today?')
    );
    assert.ok(promptBtn);
    promptBtn.click();
    await flush(40);

    assert.ok(container.textContent?.includes('Bengaluru AQI estimate is 64 (Satisfactory).'));
    assert.ok(container.textContent?.includes('Rule-Based Advisory Fallback'));
  } finally {
    globalThis.fetch = originalFetch;
    root.unmount();
    win.close();
  }
});
