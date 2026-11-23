export type AqiStandard = 'cpcb' | 'us_epa' | 'european';

export type AqiCategoryKey =
  | 'good'
  | 'satisfactory'
  | 'moderate'
  | 'poor'
  | 'very_poor'
  | 'severe'
  | 'unavailable';

export interface CityLocation {
  id: string;
  name: string;
  region: string;
  country: string;
  latitude: number;
  longitude: number;
  isDefaultIndian?: boolean;
}

export interface PollutantReading {
  key: 'pm2_5' | 'pm10' | 'carbon_monoxide' | 'nitrogen_dioxide' | 'sulphur_dioxide' | 'ozone';
  label: string;
  shortName: string;
  value: number | null;
  unit: string;
  cpcbSubIndex: number | null;
  statusText: string;
  description: string;
}

export interface HourlyDataPoint {
  time: string;
  isForecast: boolean;
  usAqi: number | null;
  europeanAqi: number | null;
  cpcbAqi: number | null;
  pm2_5: number | null;
  pm10: number | null;
  nitrogen_dioxide: number | null;
  ozone: number | null;
  sulphur_dioxide: number | null;
  carbon_monoxide: number | null;
}

export type AqiDataOrigin = 'live_api_estimate' | 'cached_snapshot' | 'unavailable';

export interface NormalizedAqiData {
  location: CityLocation;
  timestamp: string;
  fetchedAt: string;
  isStale: boolean;
  dataOrigin: AqiDataOrigin;
  sourceName: string;
  sourceUrl: string;
  indices: {
    cpcb: {
      value: number | null;
      category: string;
      categoryKey: AqiCategoryKey;
      dominantPollutant: string | null;
      status: 'computed' | 'insufficient_data';
      note: string;
    };
    usEpa: {
      value: number | null;
      category: string;
      categoryKey: AqiCategoryKey;
    };
    european: {
      value: number | null;
      category: string;
      categoryKey: AqiCategoryKey;
    };
  };
  pollutants: PollutantReading[];
  hourly: HourlyDataPoint[];
  errorMessage?: string;
}

export interface SmartRecommendation {
  standardUsed: AqiStandard;
  aqiValue: number | null;
  category: string;
  categoryKey: AqiCategoryKey;
  headline: string;
  outdoorActivity: {
    verdict:
      | 'Favorable'
      | 'Moderate Caution'
      | 'Limit Intensity'
      | 'Avoid Outdoor Exercise'
      | 'Data Unavailable';
    summary: string;
    activities: string[];
  };
  sensitiveGroups: {
    riskLevel: 'Low' | 'Elevated' | 'High' | 'Very High' | 'Unknown';
    guidance: string;
  };
  indoorAlternatives: string[];
  precautions: string[];
  pollutionExplanation: string;
  forecastSummary: {
    available: boolean;
    message: string;
    lowestForecastAqi?: number;
    lowestForecastTime?: string;
    highestForecastAqi?: number;
    highestForecastTime?: string;
  };
}

export interface CommunityReport {
  id: number;
  locationName: string;
  latitude: number | null;
  longitude: number | null;
  category: 'Smoke' | 'Road Dust' | 'Waste Burning' | 'Industrial Emissions' | 'Traffic Haze';
  severity: 'Low' | 'Moderate' | 'High';
  description: string;
  createdAt: string;
  verified: boolean;
}

export interface AssistantReply {
  answer: string;
  mode: 'gemini_live' | 'rule_based_fallback';
  modelUsed?: string;
  groundedInLocation: string;
  groundedTimestamp: string;
  disclaimer: string;
}
