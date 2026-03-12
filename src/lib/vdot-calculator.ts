/**
 * vdot-calculator.ts — Dynamisk VDOT-beregner
 *
 * Implementerer alle 6 pilarer fra forskningsrapporten:
 *  1. Grade Adjusted Pace (GAP) — Strava-verdi eller egne faktorer
 *  2. Værnormalisering — temperatur + duggpunkt → fartskorreksjon
 *  3. Submaksimal korrelasjon + støyfiltrering — steady-state deteksjon
 *  4. Eksponentiell forfallsvekting — ferske data dominerer
 *  5. Race equivalency prediksjoner — VDOT → løpstider alle distanser
 *  6. Treningssoner fra dynamisk VDOT — Daniels-soner med bpm-ranger
 *
 * Importerer fra metrics.ts og weather.ts men endrer dem IKKE.
 */

import { StravaActivity, StravaSplitMetric } from "@/types/strava";
import { WeatherData } from "@/lib/weather";
import {
  estimateVDOT,
  getDanielsTrainingPaces,
  calculateHRZones,
  classifyActivityType,
  filterValidRuns,
  type DanielsTrainingPaces,
} from "@/lib/metrics";

// ═══════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════

export interface VDOTActivityResult {
  activityId: number;
  activityName: string;
  date: string;
  distanceKm: number;
  durationMin: number;
  avgHR: number | null;
  rawVdot: number | null;
  gapCorrectedVdot: number | null;
  weatherCorrectedVdot: number | null;
  finalVdot: number | null;
  corrections: {
    gapApplied: boolean;
    gapSpeedMperMin: number | null;
    weatherCorrectionPct: number;
    weatherSum: number | null;
    steadyStateFiltered: boolean;
    isTreadmill: boolean;
  };
  weight: number;
  activityType: string;
  isQualifying: boolean;
  disqualifyReason: string | null;
}

export interface RacePrediction {
  distance: string;
  distanceMeters: number;
  predictedTimeSeconds: number;
  predictedTime: string;
  pacePerKm: string;
}

export interface EnhancedTrainingZone {
  name: string;
  nameNorwegian: string;
  pctVdotMin: number;
  pctVdotMax: number;
  pace: string;
  hrMin: number;
  hrMax: number;
  purpose: string;
}

export interface DynamicVDOTResult {
  currentVdot: number;
  vdotTrend: { date: string; vdot: number; label: string }[];
  perActivityResults: VDOTActivityResult[];
  racePredictions: RacePrediction[];
  trainingPaces: DanielsTrainingPaces | null;
  trainingZones: EnhancedTrainingZone[];
  hrZones: { zone: string; min: number; max: number }[];
  confidence: "high" | "medium" | "low";
  dataPointCount: number;
  methodology: string[];
}

// ═══════════════════════════════════════════════════════════════
//  PILAR 1: GRADE ADJUSTED PACE (GAP)
// ═══════════════════════════════════════════════════════════════

/**
 * Get GAP-corrected speed for an activity.
 * Prefers Strava's own average_grade_adjusted_speed (big-data calibrated).
 * Falls back to split-level GAP with eccentric braking filter.
 */
function getGAPCorrectedSpeedMperMin(activity: StravaActivity): number | null {
  // Primary: Strava's GAP (trained on millions of activities)
  if (activity.average_grade_adjusted_speed && activity.average_grade_adjusted_speed > 0) {
    return activity.average_grade_adjusted_speed * 60; // m/s → m/min
  }

  // Fallback: compute GAP from splits with eccentric braking filter
  if (activity.splits_metric && activity.splits_metric.length >= 3) {
    let totalWeightedSpeed = 0;
    let totalDistance = 0;

    for (const split of activity.splits_metric) {
      if (!split.distance || split.distance < 500 || !split.average_speed || split.average_speed <= 0) continue;

      // Calculate grade
      const grade = split.elevation_difference != null && split.distance > 0
        ? (split.elevation_difference / split.distance) * 100
        : 0;

      // Eccentric braking filter: exclude extreme downhill (< -8%)
      if (grade < -8) continue;

      // GAP adjustment
      const rawPaceSecPerKm = 1000 / split.average_speed;
      let adjustment: number;
      if (grade >= 0) {
        adjustment = grade * 12; // sec/km per % uphill
      } else {
        // Moderate downhill: cap benefit to avoid inflated speeds
        adjustment = grade * 8;
        // For steep downhill (-5 to -8%), reduce benefit further
        if (grade < -5) {
          adjustment = grade * 5;
        }
      }

      const gapPaceSecPerKm = rawPaceSecPerKm - adjustment;
      if (gapPaceSecPerKm <= 0) continue;

      const gapSpeed = 1000 / gapPaceSecPerKm; // m/s
      totalWeightedSpeed += gapSpeed * split.distance;
      totalDistance += split.distance;
    }

    if (totalDistance > 0) {
      return (totalWeightedSpeed / totalDistance) * 60; // m/s → m/min
    }
  }

  // No GAP available — return null
  return null;
}

// ═══════════════════════════════════════════════════════════════
//  PILAR 2: VÆRNORMALISERING (temperatur + duggpunkt)
// ═══════════════════════════════════════════════════════════════

/**
 * Weather correction from research document table.
 * Sum = Temp(°F) + Dewpoint(°F)
 * Returns a multiplier >= 1.0 representing how much faster
 * the runner WOULD have run in ideal conditions.
 */
export function getWeatherCorrectionFactor(tempC: number, dewpointC: number): number {
  const tempF = tempC * 9 / 5 + 32;
  const dewF = dewpointC * 9 / 5 + 32;
  const sum = tempF + dewF;

  // Interpolated correction based on research table
  if (sum <= 100) return 1.0;
  if (sum <= 110) return 1.0 + (0.005 * (sum - 100) / 10);
  if (sum <= 120) return 1.005 + (0.005 * (sum - 110) / 10);
  if (sum <= 130) return 1.01 + (0.01 * (sum - 120) / 10);
  if (sum <= 140) return 1.02 + (0.01 * (sum - 130) / 10);
  if (sum <= 150) return 1.03 + (0.015 * (sum - 140) / 10);
  if (sum <= 160) return 1.045 + (0.015 * (sum - 150) / 10);
  // 161+: 6-10%
  return Math.min(1.10, 1.06 + (0.04 * (sum - 160) / 20));
}

/**
 * Get weather correction percentage for display (0 if no correction)
 */
function getWeatherCorrectionPct(weather: WeatherData | null): number {
  if (!weather) return 0;
  const factor = getWeatherCorrectionFactor(weather.temperature, weather.dewpoint);
  return Math.round((factor - 1) * 1000) / 10; // e.g., 2.5%
}

// ═══════════════════════════════════════════════════════════════
//  PILAR 3: SUBMAKSIMAL KORRELASJON + STØYFILTRERING
// ═══════════════════════════════════════════════════════════════

// Treadmill speed correction (from metrics.ts, keep in sync)
const TREADMILL_SPEED_CORRECTION = 1.03;

/**
 * Analyse steady-state quality of an activity.
 * Returns false (non-qualifying) for intervals, fartlek, short runs,
 * and activities with extreme cardiac drift.
 */
function analyzeActivityQuality(
  activity: StravaActivity,
  maxHR: number
): { isSteadyState: boolean; reason: string | null } {
  // Must have HR data
  if (!activity.average_heartrate || !maxHR || maxHR <= 0) {
    return { isSteadyState: false, reason: "Mangler pulsdata" };
  }

  // Minimum duration: 15 minutes
  if (activity.moving_time < 900) {
    return { isSteadyState: false, reason: "For kort varighet (<15 min)" };
  }

  // Must be sufficiently intense for reliable VO2max extrapolation (>= 80% maxHR)
  // Below this threshold, the HR-pace relationship is too flat for valid extrapolation.
  // Easy/recovery runs (68-79% maxHR) are excluded — matches metrics.ts behavior.
  const hrPct = (activity.average_heartrate / maxHR) * 100;
  if (hrPct < 80) {
    return { isSteadyState: false, reason: "For lav intensitet (<80% av makspuls)" };
  }

  // Detect intervals/fartlek via split pace variance
  if (activity.splits_metric && activity.splits_metric.length >= 3) {
    type SplitWithHeartRate = StravaSplitMetric & { average_heartrate: number };
    const validSplits = activity.splits_metric.filter(
      (s: StravaSplitMetric) => s.distance >= 800 && s.average_speed > 0
    );

    if (validSplits.length >= 3) {
      const speeds = validSplits.map((s: StravaSplitMetric) => s.average_speed);
      const avgSpeed = speeds.reduce((a: number, b: number) => a + b, 0) / speeds.length;
      const variance = speeds.reduce((sum: number, s: number) => sum + Math.pow(s - avgSpeed, 2), 0) / speeds.length;
      const cv = Math.sqrt(variance) / avgSpeed;

      // High pace variance → intervals/fartlek
      if (cv > 0.10) {
        return { isSteadyState: false, reason: "Intervall/fartlek (høy fartsvariasjon)" };
      }
    }

    // Cardiac drift check: compare first 25% and last 25% of splits
    const splitsWithHR = validSplits.filter(
      (s: StravaSplitMetric): s is SplitWithHeartRate =>
        typeof s.average_heartrate === "number" && s.average_heartrate > 0
    );
    if (splitsWithHR.length >= 4) {
      const q1Count = Math.max(1, Math.floor(splitsWithHR.length * 0.25));
      const firstQ = splitsWithHR.slice(0, q1Count);
      const lastQ = splitsWithHR.slice(-q1Count);

      const avgHRFirst = firstQ.reduce((sum: number, s: SplitWithHeartRate) => sum + s.average_heartrate, 0) / firstQ.length;
      const avgHRLast = lastQ.reduce((sum: number, s: SplitWithHeartRate) => sum + s.average_heartrate, 0) / lastQ.length;

      if (avgHRFirst > 0) {
        const driftPct = ((avgHRLast - avgHRFirst) / avgHRFirst) * 100;
        // Extreme drift (>10%) → cardiac drift compromises HR-pace relationship
        if (driftPct > 10) {
          return { isSteadyState: false, reason: `Høy kardiovaskulær drift (${driftPct.toFixed(1)}%)` };
        }
      }
    }
  }

  // Also check lap structure for structured workouts
  if (activity.laps && activity.laps.length >= 3) {
    const validLaps = activity.laps.filter(l => l.distance > 100 && l.average_speed > 0);
    if (validLaps.length >= 3) {
      const speeds = validLaps.map(l => l.average_speed);
      const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
      const variance = speeds.reduce((sum, s) => sum + Math.pow(s - avgSpeed, 2), 0) / speeds.length;
      const cv = Math.sqrt(variance) / avgSpeed;
      if (cv > 0.08) {
        return { isSteadyState: false, reason: "Strukturert økt (manuelt markerte runder)" };
      }
    }
  }

  // Race type is qualifying (maximal effort → best VDOT source)
  if (activity.workout_type === 1) {
    return { isSteadyState: true, reason: null };
  }

  return { isSteadyState: true, reason: null };
}

// ═══════════════════════════════════════════════════════════════
//  PILAR 4: EKSPONENTIELL FORFALLSVEKTING
// ═══════════════════════════════════════════════════════════════

/**
 * Exponential decay weight.
 * halfLifeDays=21 → 50% weight after 3 weeks, 25% after 6 weeks, ~6% after 90 days
 */
function calculateExponentialWeight(activityDate: Date, referenceDate: Date, halfLifeDays: number = 21): number {
  const daysDiff = (referenceDate.getTime() - activityDate.getTime()) / (1000 * 60 * 60 * 24);
  if (daysDiff < 0) return 1.0; // Future date (should not happen)
  return Math.exp(-0.693 * daysDiff / halfLifeDays);
}

// ═══════════════════════════════════════════════════════════════
//  PILAR 5: RACE EQUIVALENCY PREDIKSJONER
// ═══════════════════════════════════════════════════════════════

/** Standard race distances */
const RACE_DISTANCES = [
  { label: "1 km", meters: 1000 },
  { label: "1,5 km", meters: 1500 },
  { label: "1 mile", meters: 1609.34 },
  { label: "3 km", meters: 3000 },
  { label: "5 km", meters: 5000 },
  { label: "10 km", meters: 10000 },
  { label: "15 km", meters: 15000 },
  { label: "Halvmaraton", meters: 21097.5 },
  { label: "Maraton", meters: 42195 },
];

/**
 * Predict race time for a given distance using VDOT.
 * Binary search: find the time T such that estimateVDOT(distance, T) = targetVDOT.
 */
function predictTimeForDistance(vdot: number, distanceMeters: number): number {
  // Speed bounds (m/s): 1 m/s (very slow) to 10 m/s (sub-elite sprint)
  let lo = distanceMeters / 10; // impossibly fast (seconds)
  let hi = distanceMeters / 1;  // impossibly slow

  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    const est = estimateVDOT(distanceMeters, mid);
    if (est === 0) {
      hi = mid; // time too short for formula
      continue;
    }
    if (est > vdot) lo = mid;
    else hi = mid;
  }

  return Math.round((lo + hi) / 2);
}

function formatTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.round(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatPacePerKm(distanceMeters: number, timeSeconds: number): string {
  const km = distanceMeters / 1000;
  const secsPerKm = timeSeconds / km;
  const mins = Math.floor(secsPerKm / 60);
  const secs = Math.round(secsPerKm % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}/km`;
}

export function predictRaceTimes(vdot: number): RacePrediction[] {
  if (!vdot || vdot <= 0) return [];

  return RACE_DISTANCES.map(({ label, meters }) => {
    const timeSec = predictTimeForDistance(vdot, meters);
    return {
      distance: label,
      distanceMeters: meters,
      predictedTimeSeconds: timeSec,
      predictedTime: formatTime(timeSec),
      pacePerKm: formatPacePerKm(meters, timeSec),
    };
  });
}

// ═══════════════════════════════════════════════════════════════
//  PILAR 6: TRENINGSSONER FRA DYNAMISK VDOT
// ═══════════════════════════════════════════════════════════════

/** VO2 cost formula from Daniels */
function speedToVO2(speedMperMin: number): number {
  return -4.60 + 0.182258 * speedMperMin + 0.000104 * Math.pow(speedMperMin, 2);
}

/** Inverse: VO2 → speed (m/min) */
function vo2ToSpeedMperMin(vo2: number): number {
  const a = 0.000104;
  const b = 0.182258;
  const c = -(vo2 + 4.60);
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return 0;
  return (-b + Math.sqrt(discriminant)) / (2 * a);
}

function speedToPaceStr(speedMperMin: number): string {
  if (speedMperMin <= 0) return "—";
  const secsPerKm = (1000 / speedMperMin) * 60;
  const mins = Math.floor(secsPerKm / 60);
  const secs = Math.round(secsPerKm % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}/km`;
}

export function getEnhancedTrainingZones(vdot: number, maxHR: number): EnhancedTrainingZone[] {
  if (!vdot || vdot <= 0) return [];

  const hrZones = calculateHRZones(maxHR);

  const zones: EnhancedTrainingZone[] = [
    {
      name: "Easy (E)",
      nameNorwegian: "Rolig",
      pctVdotMin: 59,
      pctVdotMax: 74,
      pace: `${speedToPaceStr(vo2ToSpeedMperMin(vdot * 0.74))} – ${speedToPaceStr(vo2ToSpeedMperMin(vdot * 0.59))}`,
      hrMin: hrZones[0]?.min ?? 0,
      hrMax: hrZones[1]?.max ?? 0,
      purpose: "Aerob base, kapillærisering, restitusjon",
    },
    {
      name: "Marathon (M)",
      nameNorwegian: "Maraton",
      pctVdotMin: 75,
      pctVdotMax: 84,
      pace: `${speedToPaceStr(vo2ToSpeedMperMin(vdot * 0.84))} – ${speedToPaceStr(vo2ToSpeedMperMin(vdot * 0.75))}`,
      hrMin: hrZones[1]?.max ?? 0,
      hrMax: hrZones[2]?.max ?? 0,
      purpose: "Terskelbygging for lange løp, maratontempo",
    },
    {
      name: "Threshold (T)",
      nameNorwegian: "Terskel",
      pctVdotMin: 85,
      pctVdotMax: 88,
      pace: `${speedToPaceStr(vo2ToSpeedMperMin(vdot * 0.88))} – ${speedToPaceStr(vo2ToSpeedMperMin(vdot * 0.85))}`,
      hrMin: hrZones[2]?.max ?? 0,
      hrMax: hrZones[3]?.max ?? 0,
      purpose: "Forskyve laktatterskel, utholdende submaksimal fart",
    },
    {
      name: "Interval (I)",
      nameNorwegian: "Intervall",
      pctVdotMin: 95,
      pctVdotMax: 100,
      pace: `${speedToPaceStr(vo2ToSpeedMperMin(vdot * 1.00))} – ${speedToPaceStr(vo2ToSpeedMperMin(vdot * 0.95))}`,
      hrMin: hrZones[3]?.max ?? 0,
      hrMax: hrZones[4]?.max ?? maxHR,
      purpose: "Heve VO₂max, forbedre hjertepumpekapasitet",
    },
    {
      name: "Repetition (R)",
      nameNorwegian: "Repetisjon",
      pctVdotMin: 105,
      pctVdotMax: 120,
      pace: `${speedToPaceStr(vo2ToSpeedMperMin(vdot * 1.20))} – ${speedToPaceStr(vo2ToSpeedMperMin(vdot * 1.05))}`,
      hrMin: hrZones[4]?.max ?? maxHR,
      hrMax: maxHR,
      purpose: "Løpsøkonomi, nevromuskulær baning, anaerob fart",
    },
  ];

  return zones;
}

// ═══════════════════════════════════════════════════════════════
//  PER-ACTIVITY VDOT MED ALLE KORREKSJONAR
// ═══════════════════════════════════════════════════════════════

/**
 * Core VDOT estimation for a single activity using HR-based submaximal method.
 * Mirrors logic from metrics.ts estimateVDOTForActivity but with corrections.
 */
function estimateVDOTFromHR(
  speed: number, // m/min (already corrected for GAP/weather/treadmill)
  hr: number,
  maxHR: number,
  restingHR: number
): number | null {
  if (speed <= 0 || hr <= 0 || maxHR <= 0) return null;

  const vo2AtPace = speedToVO2(speed);

  // Primary: HRR method (Swain et al. 1997)
  // Requires >= 70% HRR to be in the reliable linear region of the HR-VO2 relationship.
  if (restingHR > 0) {
    const hrRange = maxHR - restingHR;
    if (hrRange > 20) {
      const hrr = (hr - restingHR) / hrRange;
      if (hrr >= 0.70 && hrr <= 1.0) {
        const vo2rest = 3.5;
        const est = (vo2AtPace - vo2rest) / hrr + vo2rest;
        if (est > 25 && est < 85) return est;
      }
    }
  }

  // Fallback: Londeree equation (%HRmax → %VO2max)
  // Only valid at >= 80% HRmax where the linear approximation holds.
  // Below this, the equation produces wildly inaccurate results (mirrors metrics.ts minHR=80%).
  const hrMaxPct = (hr / maxHR) * 100;
  if (hrMaxPct >= 80 && hrMaxPct <= 100) {
    const pctVO2max = (1.408 * hrMaxPct - 45.1) / 100;
    if (pctVO2max > 0.4 && pctVO2max <= 1.0) {
      const est = vo2AtPace / pctVO2max;
      if (est > 25 && est < 85) return est;
    }
  }

  return null;
}

/**
 * Calculate corrected VDOT for one activity.
 * Applies all 3 correction layers (GAP, weather, steady-state).
 */
export function calculateCorrectedVDOT(
  activity: StravaActivity,
  maxHR: number,
  restingHR: number,
  weather: WeatherData | null
): VDOTActivityResult {
  const isTreadmill = activity.trainer === true;
  const activityType = classifyActivityType(activity, maxHR);
  const date = activity.start_date_local || new Date().toISOString();
  const distanceKm = Math.round((activity.distance / 1000) * 100) / 100;
  const durationMin = Math.round((activity.moving_time / 60) * 10) / 10;

  const base: Omit<VDOTActivityResult, "rawVdot" | "gapCorrectedVdot" | "weatherCorrectedVdot" | "finalVdot" | "corrections" | "weight" | "isQualifying" | "disqualifyReason"> = {
    activityId: activity.id,
    activityName: activity.name,
    date,
    distanceKm,
    durationMin,
    avgHR: activity.average_heartrate ?? null,
    activityType,
  };

  // Step 1: Check steady-state quality
  const { isSteadyState, reason: ssReason } = analyzeActivityQuality(activity, maxHR);

  // Step 2: Determine effective speed
  const baseSpeed = activity.average_speed * 60; // m/min
  const gapSpeed = getGAPCorrectedSpeedMperMin(activity);
  const gapApplied = gapSpeed !== null && !isTreadmill;
  let effectiveSpeed = gapApplied ? gapSpeed! : baseSpeed;

  // Treadmill correction
  if (isTreadmill) {
    effectiveSpeed *= TREADMILL_SPEED_CORRECTION;
  }

  // Step 3: Raw VDOT (before weather)
  const rawVdot = activity.average_heartrate
    ? estimateVDOTFromHR(baseSpeed, activity.average_heartrate, maxHR, restingHR)
    : null;

  const gapCorrectedVdot = (gapApplied && activity.average_heartrate)
    ? estimateVDOTFromHR(gapSpeed!, activity.average_heartrate, maxHR, restingHR)
    : rawVdot;

  // Step 4: Weather correction — boost speed, recalculate VDOT
  const weatherCorrPct = !isTreadmill ? getWeatherCorrectionPct(weather) : 0;
  const weatherFactor = 1 + weatherCorrPct / 100;
  const weatherCorrectedSpeed = effectiveSpeed * weatherFactor;

  const weatherCorrectedVdot = activity.average_heartrate
    ? estimateVDOTFromHR(weatherCorrectedSpeed, activity.average_heartrate, maxHR, restingHR)
    : null;

  // Step 5: Final VDOT = fully corrected
  const finalVdot = weatherCorrectedVdot ?? gapCorrectedVdot ?? rawVdot;

  // Race result VDOT (from finish time/distance, not HR-based)
  // Races are the gold standard — use Daniels formula directly
  let raceVdot: number | null = null;
  if (activity.workout_type === 1 && activity.distance >= 1500) {
    raceVdot = estimateVDOT(activity.distance, activity.moving_time);
    // Apply weather correction to race VDOT too
    if (raceVdot > 0 && weatherFactor > 1) {
      // Race was slower due to heat → actual fitness is higher
      const correctedSpeed = (activity.distance / activity.moving_time) * weatherFactor;
      const correctedTime = activity.distance / correctedSpeed;
      raceVdot = estimateVDOT(activity.distance, correctedTime);
    }
  }

  const bestVdot = raceVdot && raceVdot > 0 ? raceVdot : finalVdot;

  // Qualifying criteria
  const isQualifying = isSteadyState && bestVdot !== null && bestVdot > 0;
  const disqualifyReason = !isSteadyState ? ssReason : (bestVdot === null ? "Kunne ikke beregne VDOT" : null);

  const weatherSum = weather
    ? (weather.temperature * 9 / 5 + 32) + (weather.dewpoint * 9 / 5 + 32)
    : null;

  return {
    ...base,
    rawVdot: rawVdot ? Math.round(rawVdot * 10) / 10 : null,
    gapCorrectedVdot: gapCorrectedVdot ? Math.round(gapCorrectedVdot * 10) / 10 : null,
    weatherCorrectedVdot: weatherCorrectedVdot ? Math.round(weatherCorrectedVdot * 10) / 10 : null,
    finalVdot: bestVdot ? Math.round(bestVdot * 10) / 10 : null,
    corrections: {
      gapApplied,
      gapSpeedMperMin: gapSpeed,
      weatherCorrectionPct: weatherCorrPct,
      weatherSum,
      steadyStateFiltered: !isSteadyState,
      isTreadmill,
    },
    weight: 0, // Will be assigned later
    isQualifying,
    disqualifyReason,
  };
}

// ═══════════════════════════════════════════════════════════════
//  DYNAMISK VDOT — RULLERENDE MED EKSPONENTIELL VEKTING
// ═══════════════════════════════════════════════════════════════

/**
 * Calculate the dynamic VDOT from a set of per-activity results.
 * Uses exponential decay weighting: recent activities dominate.
 * Race results get 2x weight (gold standard data).
 */
function calculateWeightedVDOT(
  results: VDOTActivityResult[],
  referenceDate: Date
): number {
  const qualifying = results.filter(r => r.isQualifying && r.finalVdot !== null);
  if (qualifying.length === 0) return 0;

  let weightedSum = 0;
  let totalWeight = 0;

  for (const result of qualifying) {
    const actDate = new Date(result.date);
    let weight = calculateExponentialWeight(actDate, referenceDate);

    // Race results get 2x weight (most reliable VDOT source)
    if (result.activityType === "Race") {
      weight *= 2.0;
    }

    result.weight = Math.round(weight * 1000) / 1000;
    weightedSum += result.finalVdot! * weight;
    totalWeight += weight;
  }

  if (totalWeight === 0) return 0;
  return Math.round((weightedSum / totalWeight) * 10) / 10;
}

/**
 * Calculate VDOT trend over time.
 * For each qualifying activity, compute the rolling weighted VDOT
 * up to that date, so we can chart the progression.
 */
function calculateVDOTTrend(
  results: VDOTActivityResult[]
): { date: string; vdot: number; label: string }[] {
  const qualifying = results
    .filter(r => r.isQualifying && r.finalVdot !== null)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (qualifying.length === 0) return [];

  const trend: { date: string; vdot: number; label: string }[] = [];

  for (let i = 0; i < qualifying.length; i++) {
    const refDate = new Date(qualifying[i].date);
    const activitiesUpToNow = qualifying.slice(0, i + 1);

    let weightedSum = 0;
    let totalWeight = 0;

    for (const r of activitiesUpToNow) {
      const w = calculateExponentialWeight(new Date(r.date), refDate);
      weightedSum += r.finalVdot! * w;
      totalWeight += w;
    }

    const rollingVdot = totalWeight > 0
      ? Math.round((weightedSum / totalWeight) * 10) / 10
      : 0;

    const dateObj = new Date(qualifying[i].date);
    const label = dateObj.toLocaleDateString("no-NO", { day: "numeric", month: "short" });

    trend.push({
      date: qualifying[i].date.split("T")[0],
      vdot: rollingVdot,
      label,
    });
  }

  return trend;
}

// ═══════════════════════════════════════════════════════════════
//  HOVEDFUNKSJON — FULL DYNAMISK VDOT-ANALYSE
// ═══════════════════════════════════════════════════════════════

/**
 * Main entry point: compute the full dynamic VDOT analysis.
 *
 * @param activities - All Strava activities (last 90 days)
 * @param maxHR - Max heart rate from user profile
 * @param restingHR - Resting heart rate from user profile
 * @param weatherMap - Map of activityId → WeatherData (fetched externally)
 */
export function computeDynamicVDOT(
  activities: StravaActivity[],
  maxHR: number,
  restingHR: number,
  weatherMap: Map<number, WeatherData | null>
): DynamicVDOTResult {
  const validRuns = filterValidRuns(activities);
  const now = new Date();

  // Step 1: Per-activity VDOT with all corrections
  const perActivityResults: VDOTActivityResult[] = validRuns.map(activity => {
    const weather = weatherMap.get(activity.id) ?? null;
    return calculateCorrectedVDOT(activity, maxHR, restingHR, weather);
  });

  // Sort by date descending (most recent first)
  perActivityResults.sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  // Step 2: Calculate weights
  for (const result of perActivityResults) {
    if (result.isQualifying) {
      result.weight = calculateExponentialWeight(new Date(result.date), now);
      if (result.activityType === "Race") result.weight *= 2.0;
      result.weight = Math.round(result.weight * 1000) / 1000;
    }
  }

  // Step 3: Dynamic VDOT
  const currentVdot = calculateWeightedVDOT(perActivityResults, now);

  // Step 4: Trend
  const vdotTrend = calculateVDOTTrend(perActivityResults);

  // Step 5: Race predictions
  const racePredictions = predictRaceTimes(currentVdot);

  // Step 6: Training paces and zones
  const trainingPaces = getDanielsTrainingPaces(currentVdot);
  const trainingZones = getEnhancedTrainingZones(currentVdot, maxHR);
  const hrZones = calculateHRZones(maxHR);

  // Step 7: Confidence assessment
  const qualifyingCount = perActivityResults.filter(r => r.isQualifying).length;
  const confidence: "high" | "medium" | "low" =
    qualifyingCount >= 10 ? "high" : qualifyingCount >= 4 ? "medium" : "low";

  // Step 8: Methodology summary
  const methodology: string[] = [];
  const gapCount = perActivityResults.filter(r => r.corrections.gapApplied).length;
  const weatherCount = perActivityResults.filter(r => r.corrections.weatherCorrectionPct > 0).length;
  const filteredCount = perActivityResults.filter(r => r.corrections.steadyStateFiltered).length;
  const treadmillCount = perActivityResults.filter(r => r.corrections.isTreadmill).length;

  methodology.push(`${qualifyingCount} av ${perActivityResults.length} aktiviteter kvalifiserer`);
  if (gapCount > 0) methodology.push(`Gradientjustering (GAP) på ${gapCount} aktiviteter`);
  if (weatherCount > 0) methodology.push(`Værkorreksjon (temp + duggpunkt) på ${weatherCount} aktiviteter`);
  if (filteredCount > 0) methodology.push(`${filteredCount} aktiviteter filtrert (intervall/drift/støy)`);
  if (treadmillCount > 0) methodology.push(`${treadmillCount} mølle-aktiviteter (+3% fartskorreksjon)`);
  methodology.push("Eksponentiell forfallsvekting (halvtid 21 dager)");
  methodology.push("Submaksimal HR-metode (Swain HRR + Londeree fallback)");

  return {
    currentVdot,
    vdotTrend,
    perActivityResults,
    racePredictions,
    trainingPaces,
    trainingZones,
    hrZones,
    confidence,
    dataPointCount: qualifyingCount,
    methodology,
  };
}
