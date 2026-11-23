import type {
  AqiCategoryKey,
  AqiStandard,
  NormalizedAqiData,
  SmartRecommendation,
} from '../shared/types.ts';

function pickActiveIndex(
  data: NormalizedAqiData,
  standard: AqiStandard
): {
  value: number | null;
  category: string;
  categoryKey: AqiCategoryKey;
} {
  if (standard === 'cpcb') {
    return {
      value: data.indices.cpcb.value,
      category: data.indices.cpcb.category,
      categoryKey: data.indices.cpcb.categoryKey,
    };
  }
  if (standard === 'european') {
    return data.indices.european;
  }
  return data.indices.usEpa;
}

function summarizeForecast(
  data: NormalizedAqiData,
  standard: AqiStandard
): SmartRecommendation['forecastSummary'] {
  const forecastPoints = data.hourly.filter((pt) => pt.isForecast);
  const scored = forecastPoints
    .map((pt) => {
      const val =
        standard === 'cpcb'
          ? pt.cpcbAqi
          : standard === 'european'
          ? pt.europeanAqi
          : pt.usAqi;
      return val !== null ? { time: pt.time, value: val } : null;
    })
    .filter((item): item is { time: string; value: number } => item !== null);

  if (scored.length === 0) {
    return {
      available: false,
      message:
        'Forecast time-window guidance is unavailable because hourly model forecast data is missing for this location.',
    };
  }

  let lowest = scored[0];
  let highest = scored[0];
  for (const pt of scored) {
    if (pt.value < lowest.value) lowest = pt;
    if (pt.value > highest.value) highest = pt;
  }

  return {
    available: true,
    message: `Based on Open-Meteo hourly model forecasts, AQI is projected between ${lowest.value} (around ${lowest.time.replace('T', ' ')} UTC) and ${highest.value} (around ${highest.time.replace('T', ' ')} UTC).`,
    lowestForecastAqi: lowest.value,
    lowestForecastTime: lowest.time,
    highestForecastAqi: highest.value,
    highestForecastTime: highest.time,
  };
}

function buildPollutantExplanation(data: NormalizedAqiData): string {
  const pm25 = data.pollutants.find((p) => p.key === 'pm2_5')?.value ?? null;
  const pm10 = data.pollutants.find((p) => p.key === 'pm10')?.value ?? null;
  const no2 = data.pollutants.find((p) => p.key === 'nitrogen_dioxide')?.value ?? null;
  const o3 = data.pollutants.find((p) => p.key === 'ozone')?.value ?? null;
  const dominant = data.indices.cpcb.dominantPollutant;

  const availableParts: string[] = [];
  if (pm25 !== null) availableParts.push(`PM2.5 is ${pm25} μg/m³`);
  if (pm10 !== null) availableParts.push(`PM10 is ${pm10} μg/m³`);
  if (no2 !== null) availableParts.push(`NO2 is ${no2} μg/m³`);
  if (o3 !== null) availableParts.push(`O3 is ${o3} μg/m³`);

  if (availableParts.length === 0) {
    return 'Modelled pollutant concentrations are currently unavailable from the upstream environmental provider.';
  }

  const dominantNote = dominant
    ? `${dominant} is currently the primary driver of the estimated index. `
    : '';

  return `${dominantNote}Modelled surface concentrations (CAMS Global) show ${availableParts.join(', ')}. Fine particles (PM2.5) remain suspended longer and penetrate deeper into airways than coarse dust (PM10).`;
}

export function generateRecommendations(
  data: NormalizedAqiData,
  standard: AqiStandard = 'cpcb'
): SmartRecommendation {
  const active = pickActiveIndex(data, standard);
  const forecastSummary = summarizeForecast(data, standard);
  const pollutionExplanation = buildPollutantExplanation(data);
  const pm25 = data.pollutants.find((p) => p.key === 'pm2_5')?.value ?? null;

  if (active.categoryKey === 'unavailable' || active.value === null) {
    return {
      standardUsed: standard,
      aqiValue: null,
      category: 'Unavailable',
      categoryKey: 'unavailable',
      headline: 'Provider-sourced air quality estimates are currently unavailable for this city.',
      outdoorActivity: {
        verdict: 'Data Unavailable',
        summary:
          'Cannot issue outdoor intensity guidance without current modelled pollutant estimates.',
        activities: [
          'Wait for the next provider refresh or compare nearby cities on the Pollution Map.',
        ],
      },
      sensitiveGroups: {
        riskLevel: 'Unknown',
        guidance:
          'Individuals with asthma or respiratory conditions should monitor local visibility and follow their clinician-prescribed action plan until estimates return.',
      },
      indoorAlternatives: [
        'Choose indoor spaces with cross-ventilation away from visible smoke or road dust.',
      ],
      precautions: [
        'Compare nearby urban areas on the Pollution Map before planning strenuous outdoor exercise.',
      ],
      pollutionExplanation,
      forecastSummary,
    };
  }

  switch (active.categoryKey) {
    case 'good':
      return {
        standardUsed: standard,
        aqiValue: active.value,
        category: active.category,
        categoryKey: active.categoryKey,
        headline:
          'Low estimated pollution — conditions appear favorable for routine outdoor exercise and commuting.',
        outdoorActivity: {
          verdict: 'Favorable',
          summary:
            'Regional model estimates indicate minimal air quality risk for most people during outdoor running, cycling, and walking.',
          activities: [
            'Outdoor running or tempo intervals',
            'Active cycling commute',
            'Parks and outdoor recreation',
          ],
        },
        sensitiveGroups: {
          riskLevel: 'Low',
          guidance:
            'Routine outdoor activities are generally comfortable, though localized roadside traffic plumes can still vary street by street.',
        },
        indoorAlternatives: ['Open windows for natural fresh-air cross-ventilation.'],
        precautions: [
          'Stay hydrated during sustained workouts.',
          'Prefer green corridors over congested intersections where feasible.',
        ],
        pollutionExplanation,
        forecastSummary,
      };

    case 'satisfactory':
      return {
        standardUsed: standard,
        aqiValue: active.value,
        category: active.category,
        categoryKey: active.categoryKey,
        headline:
          'Acceptable estimated air quality — most people can stay active outdoors while watching for local traffic hotspots.',
        outdoorActivity: {
          verdict: 'Favorable',
          summary:
            'Normal outdoor routines carry low regional risk for most adults. Unusually sensitive individuals should monitor respiratory comfort.',
          activities: [
            'Brisk walking or steady-state jogging',
            'Outdoor errands & commuting',
            'Moderate recreational sports',
          ],
        },
        sensitiveGroups: {
          riskLevel: 'Elevated',
          guidance:
            'People with asthma, COPD, or cardiovascular conditions should watch for mild coughing or throat irritation during prolonged exertion.',
        },
        indoorAlternatives: [
          'Indoor strength training or yoga if you notice discomfort near busy roads.',
        ],
        precautions: [
          'Avoid exercising directly beside idling traffic lanes.',
          'Keep prescribed reliever inhalers accessible if you manage asthma.',
        ],
        pollutionExplanation,
        forecastSummary,
      };

    case 'moderate':
      return {
        standardUsed: standard,
        aqiValue: active.value,
        category: active.category,
        categoryKey: active.categoryKey,
        headline:
          'Moderately elevated estimated pollution — pace vigorous workouts and protect sensitive lungs.',
        outdoorActivity: {
          verdict: 'Moderate Caution',
          summary:
            'Short or low-intensity outdoor trips are typically manageable, whereas prolonged vigorous cardio increases inhaled particulate load.',
          activities: ['Short walks away from arterial highways', 'Low-exertion outdoor errands'],
        },
        sensitiveGroups: {
          riskLevel: 'High',
          guidance:
            'Children, older adults, and individuals with asthma, COPD, or heart disease should reduce prolonged or heavy outdoor exertion.',
        },
        indoorAlternatives: [
          'Move high-intensity cardio (HIIT, treadmill runs, spin) indoors.',
          'Keep windows closed during peak traffic hours.',
        ],
        precautions: [
          pm25 !== null && pm25 > 60
            ? `Modelled PM2.5 is ${pm25} μg/m³ — a well-fitted N95/FFP2 respirator can reduce particulate exposure during longer commutes.`
            : 'Consider a well-fitted N95/FFP2 respirator on dusty or congested transit routes.',
          'Run an indoor HEPA air purifier if available.',
        ],
        pollutionExplanation,
        forecastSummary,
      };

    case 'poor':
      return {
        standardUsed: standard,
        aqiValue: active.value,
        category: active.category,
        categoryKey: active.categoryKey,
        headline:
          'Poor estimated air quality — move workouts indoors and reduce outdoor particulate exposure.',
        outdoorActivity: {
          verdict: 'Limit Intensity',
          summary:
            'Avoid outdoor running and heavy exertion. Deep breathing during cardio significantly increases fine particle inhalation.',
          activities: [
            'Limit outdoor trips to essential commutes',
            'Low-pace walking with particulate protection if needed',
          ],
        },
        sensitiveGroups: {
          riskLevel: 'Very High',
          guidance:
            'Sensitive groups should avoid outdoor exertion and remain in filtered indoor environments.',
        },
        indoorAlternatives: [
          'Indoor treadmill, stationary cycling, or bodyweight circuits',
          'Indoor mobility or strength training in ventilated spaces',
        ],
        precautions: [
          'Use a tight-sealing N95/KN95/FFP2 respirator outdoors if exposure is unavoidable.',
          'Keep windows shut and operate indoor HEPA filtration if available.',
          'Avoid indoor smoke sources such as incense, candles, or unvented frying.',
        ],
        pollutionExplanation,
        forecastSummary,
      };

    case 'very_poor':
    case 'severe':
    default:
      return {
        standardUsed: standard,
        aqiValue: active.value,
        category: active.category,
        categoryKey: active.categoryKey,
        headline:
          'High pollution alert — avoid outdoor physical exertion and prioritize cleaner indoor air.',
        outdoorActivity: {
          verdict: 'Avoid Outdoor Exercise',
          summary:
            'Prolonged outdoor exposure can cause acute airway irritation even in healthy adults. Postpone outdoor workouts.',
          activities: ['Reschedule outdoor running, cycling, and field sports indoors'],
        },
        sensitiveGroups: {
          riskLevel: 'Very High',
          guidance:
            'Children, older adults, and anyone with respiratory or cardiac conditions should remain indoors with air filtration and follow clinician guidance.',
        },
        indoorAlternatives: [
          'Low-to-moderate indoor mobility, stretching, or strength workouts inside filtered rooms',
          'Indoor classes instead of outdoor group sessions',
        ],
        precautions: [
          'Wear a well-fitted N95/FFP2 respirator if stepping outdoors is unavoidable.',
          'Run HEPA air purifiers on medium/high and keep exterior doors/windows closed.',
          'Seek medical attention promptly if experiencing chest tightness, wheezing, or shortness of breath.',
        ],
        pollutionExplanation,
        forecastSummary,
      };
  }
}
