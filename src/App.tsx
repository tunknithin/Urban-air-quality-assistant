import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AqiStandard,
  CityLocation,
  NormalizedAqiData,
  SmartRecommendation,
} from '../shared/types';
import { AssistantView } from './components/AssistantView';
import { CommunityReportsView } from './components/CommunityReportsView';
import { DashboardView } from './components/DashboardView';
import { MapView } from './components/MapView';
import { MethodologyView } from './components/MethodologyView';
import { Sidebar, type NavSection } from './components/Sidebar';
import { TopBar } from './components/TopBar';

const FALLBACK_DEFAULT_LOCATION: CityLocation = {
  id: 'in-delhi',
  name: 'New Delhi',
  region: 'Delhi NCR',
  country: 'India',
  latitude: 28.6139,
  longitude: 77.209,
  isDefaultIndian: true,
};

export default function App() {
  const [isDark, setIsDark] = useState(true);
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [standard, setStandard] = useState<AqiStandard>('cpcb');
  const [curatedLocations, setCuratedLocations] = useState<CityLocation[]>([
    FALLBACK_DEFAULT_LOCATION,
  ]);
  const [selectedLocation, setSelectedLocation] = useState<CityLocation>(
    FALLBACK_DEFAULT_LOCATION
  );

  const [aqiData, setAqiData] = useState<NormalizedAqiData | null>(null);
  const [recommendation, setRecommendation] = useState<SmartRecommendation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [pendingAiPrompt, setPendingAiPrompt] = useState<string | null>(null);

  const activeAbortRef = useRef<AbortController | null>(null);
  const latestRequestIdRef = useRef(0);
  const currentDisplayedLocationIdRef = useRef<string | null>(null);

  // Sync dark mode class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [isDark]);

  // Load curated locations once with abort cleanup
  useEffect(() => {
    const controller = new AbortController();
    async function loadLocations() {
      try {
        const res = await fetch('/api/locations', { signal: controller.signal });
        if (!res.ok) return;
        const json = (await res.json()) as { locations?: CityLocation[] };
        if (json.locations && json.locations.length > 0) {
          setCuratedLocations(json.locations);
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    void loadLocations();
    return () => controller.abort();
  }, []);

  const fetchCityAqi = useCallback(
    async (loc: CityLocation, std: AqiStandard, forceRefresh = false) => {
      activeAbortRef.current?.abort();
      const controller = new AbortController();
      activeAbortRef.current = controller;

      const requestId = latestRequestIdRef.current + 1;
      latestRequestIdRef.current = requestId;

      // Never show an old city's data under a newly selected city while loading
      if (currentDisplayedLocationIdRef.current !== loc.id) {
        setAqiData(null);
        setRecommendation(null);
      }

      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          locationId: loc.id,
          lat: String(loc.latitude),
          lon: String(loc.longitude),
          name: loc.name,
          region: loc.region,
          country: loc.country,
          standard: std,
        });
        if (forceRefresh) {
          params.set('refresh', '1');
        }

        const res = await fetch(`/api/aqi?${params.toString()}`, {
          signal: controller.signal,
        });
        const json = (await res.json()) as {
          aqi?: NormalizedAqiData;
          recommendation?: SmartRecommendation;
          error?: string;
        };

        if (requestId !== latestRequestIdRef.current) return;

        if (!res.ok || !json.aqi || !json.recommendation) {
          throw new Error(json.error ?? `HTTP ${res.status}`);
        }

        currentDisplayedLocationIdRef.current = json.aqi.location.id;
        setAqiData(json.aqi);
        setRecommendation(json.recommendation);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (requestId !== latestRequestIdRef.current) return;
        setError(err instanceof Error ? err.message : 'Unable to load air quality estimates.');
      } finally {
        if (requestId === latestRequestIdRef.current) {
          setLoading(false);
        }
      }
    },
    []
  );

  useEffect(() => {
    void fetchCityAqi(selectedLocation, standard, false);
    return () => {
      activeAbortRef.current?.abort();
    };
  }, [selectedLocation, standard, fetchCityAqi]);

  function handleSelectLocationAndInspect(loc: CityLocation) {
    setSelectedLocation(loc);
    setActiveSection('dashboard');
  }

  function handleAskAssistantFromDashboard(question: string) {
    setPendingAiPrompt(question);
    setActiveSection('assistant');
  }

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-[#090D16] text-slate-900 dark:text-slate-100">
      <Sidebar
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        curatedLocations={curatedLocations}
        selectedLocation={selectedLocation}
        onSelectLocation={(loc) => setSelectedLocation(loc)}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          activeSection={activeSection}
          selectedLocation={selectedLocation}
          standard={standard}
          onChangeStandard={setStandard}
          isDark={isDark}
          onToggleTheme={() => setIsDark((prev) => !prev)}
          onRefresh={() => void fetchCityAqi(selectedLocation, standard, true)}
          loading={loading}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />

        <main className="flex-1 px-4 sm:px-6 lg:px-8 py-6 max-w-[1280px] w-full mx-auto">
          {activeSection === 'dashboard' && (
            <DashboardView
              aqi={aqiData}
              recommendation={recommendation}
              standard={standard}
              onChangeStandard={setStandard}
              loading={loading}
              error={error}
              onRetry={() => void fetchCityAqi(selectedLocation, standard, true)}
              onAskAssistant={handleAskAssistantFromDashboard}
            />
          )}

          {activeSection === 'map' && (
            <MapView
              standard={standard}
              selectedLocation={selectedLocation}
              onSelectLocationAndInspect={handleSelectLocationAndInspect}
            />
          )}

          {activeSection === 'assistant' && (
            <AssistantView
              selectedLocation={selectedLocation}
              standard={standard}
              aqi={aqiData}
              initialPrompt={pendingAiPrompt}
              onConsumeInitialPrompt={() => setPendingAiPrompt(null)}
            />
          )}

          {activeSection === 'reports' && (
            <CommunityReportsView selectedLocation={selectedLocation} />
          )}

          {activeSection === 'methodology' && <MethodologyView />}
        </main>
      </div>
    </div>
  );
}
