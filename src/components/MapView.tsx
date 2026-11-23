import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { RefreshCw } from 'lucide-react';
import type { AqiStandard, CityLocation, NormalizedAqiData } from '../../shared/types';
import { formatStandardLabel, formatUtcTimestamp, getSeverityStyle } from '../utils/aqiTheme';

interface MapViewProps {
  standard: AqiStandard;
  selectedLocation: CityLocation;
  onSelectLocationAndInspect: (loc: CityLocation) => void;
}

interface StationCluster {
  members: NormalizedAqiData[];
  centerLat: number;
  centerLon: number;
}

function getStationIndex(st: NormalizedAqiData, standard: AqiStandard) {
  if (standard === 'cpcb') return st.indices.cpcb;
  if (standard === 'european') return st.indices.european;
  return st.indices.usEpa;
}

// Group nearby markers in screen space so close cities (e.g. Mumbai & Pune) never overlap
function clusterStationsByPixel(
  map: L.Map,
  stations: NormalizedAqiData[],
  thresholdPx = 38
): StationCluster[] {
  const clusters: StationCluster[] = [];

  for (const st of stations) {
    const pt = map.latLngToLayerPoint([st.location.latitude, st.location.longitude]);
    let matched: StationCluster | null = null;

    for (const cluster of clusters) {
      const cPt = map.latLngToLayerPoint([cluster.centerLat, cluster.centerLon]);
      const dist = Math.hypot(pt.x - cPt.x, pt.y - cPt.y);
      if (dist < thresholdPx) {
        matched = cluster;
        break;
      }
    }

    if (matched) {
      matched.members.push(st);
      const count = matched.members.length;
      matched.centerLat =
        matched.members.reduce((sum, item) => sum + item.location.latitude, 0) / count;
      matched.centerLon =
        matched.members.reduce((sum, item) => sum + item.location.longitude, 0) / count;
    } else {
      clusters.push({
        members: [st],
        centerLat: st.location.latitude,
        centerLon: st.location.longitude,
      });
    }
  }

  return clusters;
}

export function MapView({
  standard,
  selectedLocation,
  onSelectLocationAndInspect,
}: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const fetchAbortRef = useRef<AbortController | null>(null);

  const [stations, setStations] = useState<NormalizedAqiData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mapZoomTick, setMapZoomTick] = useState(0);

  const loadStations = useCallback(async () => {
    fetchAbortRef.current?.abort();
    const controller = new AbortController();
    fetchAbortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/map/stations', { signal: controller.signal });
      const json = (await res.json()) as { stations?: NormalizedAqiData[]; error?: string };
      if (!res.ok) {
        throw new Error(json.error ?? `Server returned HTTP ${res.status}`);
      }
      setStations(json.stations ?? []);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setError(err instanceof Error ? err.message : 'Unable to fetch city model estimates.');
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadStations();
    return () => {
      fetchAbortRef.current?.abort();
    };
  }, [loadStations]);

  // Initialize Leaflet map once
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [21.2, 78.5],
      zoom: 5,
      zoomControl: true,
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map);

    const layerGroup = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;
    markersLayerRef.current = layerGroup;

    const onZoomEnd = () => setMapZoomTick((prev) => prev + 1);
    map.on('zoomend', onZoomEnd);

    return () => {
      map.off('zoomend', onZoomEnd);
      map.remove();
      mapInstanceRef.current = null;
      markersLayerRef.current = null;
    };
  }, []);

  // Recompute pixel clusters whenever stations, standard, or zoom changes
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layerGroup = markersLayerRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();
    const clusters = clusterStationsByPixel(map, stations, 38);

    for (const cluster of clusters) {
      if (cluster.members.length === 1) {
        const st = cluster.members[0];
        const idx = getStationIndex(st, standard);
        const style = getSeverityStyle(idx.categoryKey);
        const displayVal = idx.value !== null ? String(idx.value) : '—';
        const isActive = st.location.id === selectedLocation.id;

        const icon = L.divIcon({
          className: 'uaqa-custom-marker',
          html: `<div style="
            display:inline-flex;
            align-items:center;
            justify-content:center;
            min-width:38px;
            height:28px;
            padding:0 7px;
            border-radius:8px;
            font-family:JetBrains Mono, monospace;
            font-size:12px;
            font-weight:700;
            color:#090D16;
            background:${style.hex};
            border:${isActive ? '2.5px solid #ffffff' : '1.5px solid rgba(9,13,22,0.55)'};
            box-shadow:0 4px 12px rgba(0,0,0,0.35);
          ">${displayVal}</div>`,
          iconSize: [38, 28],
          iconAnchor: [19, 14],
        });

        const pm25 = st.pollutants.find((p) => p.key === 'pm2_5')?.value;
        const pm10 = st.pollutants.find((p) => p.key === 'pm10')?.value;

        const popupEl = document.createElement('div');
        popupEl.style.minWidth = '220px';
        popupEl.style.fontFamily = 'DM Sans, sans-serif';

        const title = document.createElement('div');
        title.style.fontWeight = '700';
        title.style.fontSize = '14px';
        title.textContent = `${st.location.name}, ${st.location.country}`;
        popupEl.appendChild(title);

        const badge = document.createElement('div');
        badge.style.fontSize = '11px';
        badge.style.opacity = '0.8';
        badge.style.marginTop = '2px';
        badge.textContent =
          st.dataOrigin === 'cached_snapshot'
            ? 'Cached Model Estimate (Stale)'
            : 'City-Level CAMS Model Estimate';
        popupEl.appendChild(badge);

        const catLine = document.createElement('div');
        catLine.style.fontSize = '12px';
        catLine.style.marginTop = '6px';
        catLine.textContent = `${formatStandardLabel(standard)} AQI: ${displayVal} (${idx.category})`;
        popupEl.appendChild(catLine);

        const polLine = document.createElement('div');
        polLine.style.fontSize = '12px';
        polLine.style.marginTop = '4px';
        polLine.textContent = `PM2.5: ${pm25 !== null && pm25 !== undefined ? `${pm25} μg/m³` : 'Unavailable'} · PM10: ${
          pm10 !== null && pm10 !== undefined ? `${pm10} μg/m³` : 'Unavailable'
        }`;
        popupEl.appendChild(polLine);

        const metaLine = document.createElement('div');
        metaLine.style.fontSize = '11px';
        metaLine.style.opacity = '0.75';
        metaLine.style.marginTop = '6px';
        metaLine.textContent = `${formatUtcTimestamp(st.timestamp)} · ${st.sourceName}`;
        popupEl.appendChild(metaLine);

        const inspectBtn = document.createElement('button');
        inspectBtn.type = 'button';
        inspectBtn.textContent = 'Inspect City';
        inspectBtn.style.marginTop = '8px';
        inspectBtn.style.padding = '5px 10px';
        inspectBtn.style.fontSize = '12px';
        inspectBtn.style.fontWeight = '600';
        inspectBtn.style.borderRadius = '6px';
        inspectBtn.style.border = 'none';
        inspectBtn.style.background = '#0891b2';
        inspectBtn.style.color = '#ffffff';
        inspectBtn.style.cursor = 'pointer';
        inspectBtn.addEventListener('click', () => {
          onSelectLocationAndInspect(st.location);
        });
        popupEl.appendChild(inspectBtn);

        L.marker([st.location.latitude, st.location.longitude], { icon })
          .bindPopup(popupEl)
          .addTo(layerGroup);
      } else {
        // Cluster marker for overlapping close cities
        const highestMember = cluster.members.reduce((best, cur) => {
          const bestVal = getStationIndex(best, standard).value ?? -1;
          const curVal = getStationIndex(cur, standard).value ?? -1;
          return curVal > bestVal ? cur : best;
        }, cluster.members[0]);

        const highestIdx = getStationIndex(highestMember, standard);
        const style = getSeverityStyle(highestIdx.categoryKey);
        const clusterLabel = `${cluster.members.length} cities`;

        const icon = L.divIcon({
          className: 'uaqa-cluster-marker',
          html: `<div style="
            display:inline-flex;
            align-items:center;
            justify-content:center;
            white-space:nowrap;
            min-width:68px;
            height:30px;
            padding:0 10px;
            border-radius:999px;
            font-family:JetBrains Mono, monospace;
            font-size:11px;
            font-weight:700;
            color:#090D16;
            background:${style.hex};
            border:2px solid #ffffff;
            box-shadow:0 4px 12px rgba(0,0,0,0.4);
          ">${clusterLabel}</div>`,
          iconSize: [74, 30],
          iconAnchor: [37, 15],
        });

        const popupEl = document.createElement('div');
        popupEl.style.minWidth = '210px';
        popupEl.style.fontFamily = 'DM Sans, sans-serif';

        const heading = document.createElement('div');
        heading.style.fontWeight = '700';
        heading.style.fontSize = '13px';
        heading.textContent = `${cluster.members.length} Nearby City Estimates`;
        popupEl.appendChild(heading);

        for (const member of cluster.members) {
          const mIdx = getStationIndex(member, standard);
          const row = document.createElement('div');
          row.style.display = 'flex';
          row.style.justifyContent = 'space-between';
          row.style.alignItems = 'center';
          row.style.gap = '10px';
          row.style.marginTop = '6px';
          row.style.fontSize = '12px';

          const labelSpan = document.createElement('span');
          labelSpan.textContent = `${member.location.name}: ${mIdx.value ?? 'N/A'}`;
          row.appendChild(labelSpan);

          const btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = 'Inspect';
          btn.style.padding = '3px 8px';
          btn.style.fontSize = '11px';
          btn.style.fontWeight = '600';
          btn.style.borderRadius = '5px';
          btn.style.border = 'none';
          btn.style.background = '#0891b2';
          btn.style.color = '#ffffff';
          btn.style.cursor = 'pointer';
          btn.addEventListener('click', () => onSelectLocationAndInspect(member.location));
          row.appendChild(btn);

          popupEl.appendChild(row);
        }

        const marker = L.marker([cluster.centerLat, cluster.centerLon], { icon }).bindPopup(popupEl);
        marker.on('click', () => {
          if (map.getZoom() < 8) {
            const bounds = L.latLngBounds(
              cluster.members.map((m) => [m.location.latitude, m.location.longitude])
            );
            map.fitBounds(bounds, { padding: [60, 60], maxZoom: 9 });
          }
        });
        marker.addTo(layerGroup);
      }
    }
  }, [stations, standard, selectedLocation.id, mapZoomTick, onSelectLocationAndInspect]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-50">
            Interactive Air Quality Model Map
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            City-level atmospheric model estimates (Open-Meteo CAMS Global) across India and global hubs — not direct ground-station measurements.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => mapInstanceRef.current?.setView([21.2, 78.5], 5)}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            India Focus
          </button>
          <button
            type="button"
            onClick={() => mapInstanceRef.current?.setView([26, 25], 2)}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            Global View
          </button>
          <button
            type="button"
            onClick={() => void loadStations()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>Reload Estimates</span>
          </button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs text-rose-700 dark:text-rose-300"
        >
          {error}
        </div>
      )}

      <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827]">
        <div
          ref={mapContainerRef}
          data-testid="pollution-leaflet-map"
          aria-label="Interactive city-level air quality model map"
          className="uaqa-leaflet-container w-full h-[360px] sm:h-[460px] z-10"
        />
      </div>

      <section
        aria-labelledby="station-comparison-heading"
        className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div>
            <h2
              id="station-comparison-heading"
              className="font-display text-base font-semibold text-slate-900 dark:text-slate-100"
            >
              Multi-City Modelled Air Quality Estimates
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              CAMS Global provider estimates per city coordinate. Unavailable values are marked explicitly and never substituted with zeros.
            </p>
          </div>
          <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
            {stations.length} cities
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                <th scope="col" className="py-3 px-6 font-medium">
                  City
                </th>
                <th scope="col" className="py-3 px-4 font-medium text-right">
                  {formatStandardLabel(standard)} AQI
                </th>
                <th scope="col" className="py-3 px-4 font-medium">
                  Category
                </th>
                <th scope="col" className="py-3 px-4 font-medium text-right">
                  PM2.5 (μg/m³)
                </th>
                <th scope="col" className="py-3 px-4 font-medium text-right">
                  PM10 (μg/m³)
                </th>
                <th scope="col" className="py-3 px-4 font-medium text-right">
                  Updated
                </th>
                <th scope="col" className="py-3 px-6 font-medium text-right">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70">
              {stations.map((st) => {
                const idx = getStationIndex(st, standard);
                const style = getSeverityStyle(idx.categoryKey);
                const pm25 = st.pollutants.find((p) => p.key === 'pm2_5')?.value;
                const pm10 = st.pollutants.find((p) => p.key === 'pm10')?.value;

                return (
                  <tr
                    key={st.location.id}
                    className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    <td className="py-3 px-6 font-medium text-slate-900 dark:text-slate-100">
                      {st.location.name}
                      <span className="text-xs font-normal text-slate-500 dark:text-slate-400 ml-1.5">
                        {st.location.country}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {idx.value ?? 'Unavailable'}
                    </td>
                    <td className={`py-3 px-4 text-xs font-medium ${style.textClass}`}>
                      {style.markerSymbol} {idx.category}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {pm25 !== null && pm25 !== undefined ? pm25 : 'Unavailable'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                      {pm10 !== null && pm10 !== undefined ? pm10 : 'Unavailable'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {st.timestamp ? `${st.timestamp.slice(11, 16)} UTC` : 'Unavailable'}
                    </td>
                    <td className="py-3 px-6 text-right">
                      <button
                        type="button"
                        onClick={() => onSelectLocationAndInspect(st.location)}
                        className="text-xs font-semibold text-cyan-600 dark:text-cyan-400 hover:underline whitespace-nowrap"
                      >
                        Inspect City
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
