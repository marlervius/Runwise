import { StravaActivity, HeartRateZoneBucket, BestEffort, StravaLap } from "@/types/strava";

// Calculate training load for last 7 days
export const calculateTrainingLoad = (activities: StravaActivity[]) => {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  
  let totalDistance = 0;
  let totalTime = 0;
  let sessionsCount = 0;
  
  activities.forEach(activity => {
    const activityDate = new Date(activity.start_date_local);
    if (activityDate >= sevenDaysAgo) {
      totalDistance += activity.distance;
      totalTime += activity.moving_time;
      sessionsCount++;
    }
  });
  
  return {
    totalDistanceKm: totalDistance / 1000,
    totalHours: totalTime / 3600,
    sessionsLast7Days: sessionsCount
  };
};

// Filter valid runs
export const filterValidRuns = (activities: StravaActivity[]): StravaActivity[] => {
  return activities.filter(activity => {
    const hasMinDistance = activity.distance > 500;
    const hasMinSpeed = activity.average_speed > 0.83;
    const isRunType = !activity.type || 
      activity.type.toLowerCase().includes('run') || 
      activity.sport_type?.toLowerCase().includes('run');
    return hasMinDistance && hasMinSpeed && isRunType;
  });
};

// Classify activity type based on avg HR % of maxHR (fallback when zone data unavailable)
export const classifyActivityType = (activity: StravaActivity, maxHR: number): string => {
  if (activity.workout_type === 1) return "Race";
  if (activity.workout_type === 3) return "Workout";

  if (!activity.average_heartrate || !maxHR || maxHR === 0) {
    return "Easy";
  }

  const hrPercent = (activity.average_heartrate / maxHR) * 100;

  if (hrPercent < 65) return "Recovery";
  if (hrPercent < 76) return "Easy / Base";
  if (hrPercent < 85) return "Tempo";
  if (hrPercent < 92) return "Threshold";
  return "VO2max";
};

// Classify using HR zone TIME DISTRIBUTION (more accurate than avg HR)
export const classifyByZones = (zones: HeartRateZoneBucket[]): { classification: string; breakdown: string } => {
  const totalTime = zones.reduce((sum, z) => sum + z.time, 0);
  if (totalTime === 0) return { classification: "Unknown", breakdown: "" };
  
  const pct = zones.map(z => (z.time / totalTime) * 100);
  const easyPct = (pct[0] || 0) + (pct[1] || 0);
  const tempoPct = pct[2] || 0;
  const hardPct = (pct[3] || 0) + (pct[4] || 0);

  const breakdown = `Z1-2: ${easyPct.toFixed(0)}% | Z3: ${tempoPct.toFixed(0)}% | Z4-5: ${hardPct.toFixed(0)}%`;

  if (easyPct >= 70) return { classification: "Easy / Base", breakdown };
  if (easyPct >= 55 && hardPct < 10) return { classification: "Easy / Aerobic", breakdown };
  if (hardPct >= 30) return { classification: "Threshold / Intervals", breakdown };
  if (tempoPct >= 30) return { classification: "Tempo", breakdown };
  if (easyPct >= 45 && tempoPct >= 20) return { classification: "Moderate / Steady State", breakdown };
  return { classification: "Mixed Intensity", breakdown };
};

// Detect running type based on workout_type, laps, and split variance
export const detectRunningType = (activity: StravaActivity): { type: string; detected: boolean; hasStructure: boolean } => {
  if (activity.workout_type === 1) return { type: 'Race', detected: false, hasStructure: false };
  if (activity.workout_type === 2) return { type: 'Long Run', detected: false, hasStructure: false };
  if (activity.workout_type === 3) return { type: 'Intervals / Structured', detected: false, hasStructure: true };
  
  if (activity.laps && activity.laps.length >= 2) {
    const lapPaces = activity.laps
      .filter(lap => lap.distance > 100)
      .map(lap => lap.average_speed > 0 ? 1000 / lap.average_speed : 0);
    
    if (lapPaces.length >= 2) {
      const avgPace = lapPaces.reduce((a, b) => a + b, 0) / lapPaces.length;
      const variance = lapPaces.reduce((sum, p) => sum + Math.pow(p - avgPace, 2), 0) / lapPaces.length;
      const stdDev = Math.sqrt(variance);
      
      if (stdDev > 20) {
        return { type: 'Intervals / Structured', detected: true, hasStructure: true };
      }
    }
    
    if (activity.laps.length >= 3) {
      return { type: 'Structured Session', detected: true, hasStructure: true };
    }
  }
  
  if (activity.splits_metric && activity.splits_metric.length >= 3) {
    const paces = activity.splits_metric
      .filter((s: any) => s.distance > 500)
      .map((s: any) => s.average_speed > 0 ? 1000 / s.average_speed : 0);
    
    if (paces.length >= 3) {
      const avgPace = paces.reduce((a: number, b: number) => a + b, 0) / paces.length;
      const variance = paces.reduce((sum: number, p: number) => sum + Math.pow(p - avgPace, 2), 0) / paces.length;
      const stdDev = Math.sqrt(variance);
      
      if (stdDev > 30) {
        return { type: 'Fartlek/Variable', detected: true, hasStructure: false };
      }
    }
  }
  
  if (activity.average_heartrate && activity.average_heartrate < 140) {
    return { type: 'Recovery Run', detected: true, hasStructure: false };
  }
  
  return { type: 'Steady Run', detected: true, hasStructure: false };
};

export const getGradeAdjustedSpeed = (split: any): number => {
  const rawSpeed = split.average_speed;
  if (!rawSpeed || rawSpeed <= 0) return 0;

  if (split.elevation_difference === undefined || split.elevation_difference === null || split.distance <= 0) {
    return rawSpeed;
  }

  const gradePercent = (split.elevation_difference / split.distance) * 100;
  const rawPaceSecPerKm = 1000 / rawSpeed;

  let adjustment: number;
  if (gradePercent >= 0) {
    adjustment = gradePercent * 12;
  } else {
    adjustment = gradePercent * 8;
  }

  const gapPaceSecPerKm = rawPaceSecPerKm - adjustment;
  if (gapPaceSecPerKm <= 0) return rawSpeed;

  return 1000 / gapPaceSecPerKm;
};

export const calculateDecoupling = (splits: any[]): { percentage: number; status: string; elevationAdjusted: boolean } | null => {
  if (!splits || splits.length < 4) return null;
  
  const validSplits = splits.filter((s: any) => 
    s.distance > 500 && s.average_speed > 0 && s.average_heartrate > 0
  );
  
  if (validSplits.length < 4) return null;

  const hasElevation = validSplits.some((s: any) => 
    s.elevation_difference !== undefined && s.elevation_difference !== null
  );
  
  const midpoint = Math.floor(validSplits.length / 2);
  const firstHalf = validSplits.slice(0, midpoint);
  const secondHalf = validSplits.slice(midpoint);
  
  const calcEF = (splits: any[]) => {
    const totalSpeed = splits.reduce((sum: number, s: any) => sum + getGradeAdjustedSpeed(s), 0);
    const totalHR = splits.reduce((sum: number, s: any) => sum + s.average_heartrate, 0);
    return (totalSpeed / splits.length) / (totalHR / splits.length);
  };
  
  const ef1 = calcEF(firstHalf);
  const ef2 = calcEF(secondHalf);
  
  const decoupling = ((ef1 - ef2) / ef1) * 100;
  
  let status: string;
  if (decoupling < 3) status = 'Excellent (aerobic)';
  else if (decoupling < 5) status = 'Good';
  else if (decoupling < 8) status = 'Moderate Drift';
  else status = 'High Drift (threshold+)';
  
  return { percentage: decoupling, status, elevationAdjusted: hasElevation };
};

export const getWeekStartMonday = (date: Date): Date => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
};

export interface WeeklyVolume {
  weekStart: string;
  weekLabel: string;
  km: number;
  hours: number;
  sessions: number;
  elevationGain: number;
}

export const calculateWeeklyVolumes = (activities: StravaActivity[]): WeeklyVolume[] => {
  if (activities.length === 0) return [];
  
  const weekMap = new Map<string, WeeklyVolume>();
  
  activities.forEach(activity => {
    const date = new Date(activity.start_date_local);
    const weekStart = getWeekStartMonday(date);
    const key = weekStart.toISOString().split('T')[0];
    
    const existing = weekMap.get(key) || {
      weekStart: key,
      weekLabel: '',
      km: 0,
      hours: 0,
      sessions: 0,
      elevationGain: 0
    };
    existing.km += activity.distance / 1000;
    existing.hours += activity.moving_time / 3600;
    existing.sessions += 1;
    existing.elevationGain += activity.total_elevation_gain || 0;
    weekMap.set(key, existing);
  });
  
  const now = new Date();
  const currentWeekStart = getWeekStartMonday(now);
  
  return Array.from(weekMap.values())
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart))
    .slice(0, 6)
    .map(week => {
      const weekDate = new Date(week.weekStart);
      const weeksAgo = Math.round(
        (currentWeekStart.getTime() - weekDate.getTime()) / (7 * 24 * 60 * 60 * 1000)
      );
      
      if (weeksAgo === 0) week.weekLabel = 'This week';
      else if (weeksAgo === 1) week.weekLabel = 'Last week';
      else week.weekLabel = `${weeksAgo}w ago`;
      
      return week;
    });
};

export interface ConsistencyMetrics {
  totalActivities: number;
  weeksSpan: number;
  avgSessionsPerWeek: number;
  longestActiveStreak: number;
  longestRestStreak: number;
  restDaysLast28: number;
  activeDaysLast28: number;
  sessionsPerWeekLast4: number[];
}

export const calculateConsistencyMetrics = (activities: StravaActivity[]): ConsistencyMetrics => {
  const empty: ConsistencyMetrics = {
    totalActivities: 0, weeksSpan: 0, avgSessionsPerWeek: 0,
    longestActiveStreak: 0, longestRestStreak: 0,
    restDaysLast28: 28, activeDaysLast28: 0, sessionsPerWeekLast4: []
  };
  
  if (activities.length === 0) return empty;
  
  const activityDays = new Set<string>();
  activities.forEach(a => {
    const day = new Date(a.start_date_local).toISOString().split('T')[0];
    activityDays.add(day);
  });
  
  const sortedDates = [...activityDays].sort();
  const firstDate = new Date(sortedDates[0]);
  const lastDate = new Date(sortedDates[sortedDates.length - 1]);
  const daysSpan = Math.max(1, Math.ceil((lastDate.getTime() - firstDate.getTime()) / (24 * 60 * 60 * 1000)));
  const weeksSpan = Math.max(1, Math.ceil(daysSpan / 7));
  
  const allDates: string[] = [];
  const current = new Date(firstDate);
  while (current <= lastDate) {
    allDates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  
  let longestActiveStreak = 0, currentActiveStreak = 0;
  let longestRestStreak = 0, currentRestStreak = 0;
  
  allDates.forEach(date => {
    if (activityDays.has(date)) {
      currentActiveStreak++;
      longestActiveStreak = Math.max(longestActiveStreak, currentActiveStreak);
      longestRestStreak = Math.max(longestRestStreak, currentRestStreak);
      currentRestStreak = 0;
    } else {
      currentRestStreak++;
      longestRestStreak = Math.max(longestRestStreak, currentRestStreak);
      longestActiveStreak = Math.max(longestActiveStreak, currentActiveStreak);
      currentActiveStreak = 0;
    }
  });
  longestActiveStreak = Math.max(longestActiveStreak, currentActiveStreak);
  longestRestStreak = Math.max(longestRestStreak, currentRestStreak);
  
  const now = new Date();
  const twentyEightDaysAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
  let activeDaysLast28 = 0;
  activityDays.forEach(day => {
    if (new Date(day) >= twentyEightDaysAgo) activeDaysLast28++;
  });
  
  const sessionsPerWeekLast4: number[] = [];
  for (let w = 0; w < 4; w++) {
    const weekEnd = new Date(now.getTime() - w * 7 * 24 * 60 * 60 * 1000);
    const weekStart = new Date(weekEnd.getTime() - 7 * 24 * 60 * 60 * 1000);
    const count = activities.filter(a => {
      const d = new Date(a.start_date_local);
      return d >= weekStart && d < weekEnd;
    }).length;
    sessionsPerWeekLast4.push(count);
  }
  
  return {
    totalActivities: activities.length,
    weeksSpan,
    avgSessionsPerWeek: parseFloat((activities.length / weeksSpan).toFixed(1)),
    longestActiveStreak,
    longestRestStreak,
    restDaysLast28: 28 - activeDaysLast28,
    activeDaysLast28,
    sessionsPerWeekLast4
  };
};

export const getWorkoutStructure = (activity: StravaActivity): string => {
  if (activity.workout_type === 1) return "race";
  if (activity.workout_type === 3) return "structured";
  if (activity.workout_type === 2) return "long_run";
  if (activity.laps && activity.laps.length >= 4) return "structured";
  return "steady";
};

export const getComparablePace = (activity: StravaActivity): { speed: number; label: string } => {
  if (activity.trainer) {
    return { speed: activity.average_speed, label: "Treadmill pace" };
  }
  if (activity.average_grade_adjusted_speed && activity.average_grade_adjusted_speed !== activity.average_speed) {
    return { speed: activity.average_grade_adjusted_speed, label: "GAP" };
  }
  return { speed: activity.average_speed, label: "Pace" };
};

export interface ACWRMetrics {
  acuteLoad: number; // Last 7 days load (volume or time)
  chronicLoad: number; // Avg load over last 28 days
  ratio: number;
  status: string; // "Sweet Spot", "Danger Zone", "Undertraining"
}

// Calculate Acute:Chronic Workload Ratio (ACWR) based on distance
export const calculateACWR = (activities: StravaActivity[]): ACWRMetrics | null => {
  if (!activities || activities.length === 0) return null;

  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const fourWeeksAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);

  let acuteDistance = 0;
  let chronicDistance = 0;

  activities.forEach(activity => {
    const activityDate = new Date(activity.start_date_local);
    const distKm = activity.distance / 1000;
    
    // Chronic load includes acute load in the 28-day sum
    if (activityDate >= fourWeeksAgo) {
      chronicDistance += distKm;
      
      // Acute load (last 7 days)
      if (activityDate >= oneWeekAgo) {
        acuteDistance += distKm;
      }
    }
  });

  const chronicLoad = chronicDistance / 4; // average per week over 4 weeks
  if (chronicLoad === 0) return null;

  const ratio = acuteDistance / chronicLoad;
  
  let status = "Unknown";
  if (ratio < 0.8) status = "Undertraining (Loss of fitness)";
  else if (ratio <= 1.3) status = "Sweet Spot (Optimal progression)";
  else if (ratio <= 1.5) status = "Caution (Approaching Danger Zone)";
  else status = "Danger Zone ⚠️ (High injury risk)";

  return {
    acuteLoad: acuteDistance,
    chronicLoad,
    ratio,
    status
  };
};

export interface ShoeStats {
  shoeId: string;
  name: string;
  count: number;
  totalDistanceKm: number;
  percentageOfRuns: number;
}

// Analyze shoe rotation over the last 30 activities
export const analyzeShoeRotation = (activities: StravaActivity[]): { stats: ShoeStats[], primaryShoeOverused: boolean } => {
  const shoeMap = new Map<string, ShoeStats>();
  let runsWithShoes = 0;

  activities.forEach(activity => {
    const gearId = activity.gear_id || (activity.gear ? activity.gear.id : null);
    const gearName = activity.gear ? activity.gear.name : gearId;
    
    if (gearId && gearName) {
      runsWithShoes++;
      const existing = shoeMap.get(gearId) || {
        shoeId: gearId,
        name: gearName,
        count: 0,
        totalDistanceKm: 0,
        percentageOfRuns: 0
      };
      existing.count += 1;
      existing.totalDistanceKm += (activity.distance / 1000);
      shoeMap.set(gearId, existing);
    }
  });

  if (runsWithShoes === 0) return { stats: [], primaryShoeOverused: false };

  const stats = Array.from(shoeMap.values())
    .map(shoe => ({
      ...shoe,
      percentageOfRuns: (shoe.count / runsWithShoes) * 100
    }))
    .sort((a, b) => b.count - a.count);

  // Consider primary shoe overused if it accounts for >85% of recent runs and user has done >= 5 runs
  const primaryShoeOverused = runsWithShoes >= 5 && stats.length > 0 && stats[0].percentageOfRuns > 85;

  return { stats, primaryShoeOverused };
};

// Estimate VDOT from a given distance (meters) and time (seconds)
// Formula based on Jack Daniels' VDOT approximation
export const estimateVDOT = (distanceMeters: number, timeSeconds: number): number => {
  if (distanceMeters < 1500 || timeSeconds <= 0) return 0; // Too short for meaningful VDOT

  const timeMinutes = timeSeconds / 60;
  const speedMetersPerMin = distanceMeters / timeMinutes;

  const vo2 = -4.60 + 0.182258 * speedMetersPerMin + 0.000104 * Math.pow(speedMetersPerMin, 2);
  const percentMax = 0.8 + 0.1894393 * Math.exp(-0.012778 * timeMinutes) + 0.2989558 * Math.exp(-0.1932605 * timeMinutes);

  if (percentMax <= 0) return 0;

  const vdot = vo2 / percentMax;
  return Math.max(0, Math.round(vdot * 10) / 10);
};

// ═══════════════════════════════════════════════════════════════
// VDOT ESTIMATION FROM TRAINING DATA
// ═══════════════════════════════════════════════════════════════
// Inspired by Firstbeat/Garmin VO2max estimation methodology:
//
// PRIMARY: Linear regression of speed vs HR across segments.
//   Extrapolate the speed-HR line to HRmax → vVO2max → VDOT.
//   This is the gold standard used by Garmin/Firstbeat watches.
//
// SECONDARY: %HRR = %VO2R (Swain et al. 1997, r=0.990) per-segment.
//   Uses Heart Rate Reserve which is far more accurate than %HRmax.
//   Formula: %HRR = (HR - HRrest) / (HRmax - HRrest) ≈ %VO2R
//
// FALLBACK: Londeree equation for %HRmax when restingHR unavailable.
//   %VO2max = 1.408 × %HRmax - 45.1 (better than Swain for %HRmax)
// ═══════════════════════════════════════════════════════════════

interface SpeedHRDataPoint {
  speedMperMin: number;  // meters per minute
  hr: number;            // absolute HR in bpm
  isTreadmill: boolean;
}

// Collect speed/HR data points from activities.
// Priority order:
//   1. Manual laps (from structured workouts) — most reliable
//   2. km splits — good for steady-state runs
//   3. Activity-level average — always available, noisier (includes warmup/cooldown)
//      Used as fallback when an activity hasn't been fully loaded yet.
const collectSpeedHRData = (
  activities: StravaActivity[],
  maxHR: number
): SpeedHRDataPoint[] => {
  const dataPoints: SpeedHRDataPoint[] = [];
  const minHR = maxHR * 0.65; // Only include segments where HR is meaningfully elevated

  activities.forEach(activity => {
    const isTreadmill = activity.trainer === true;
    let addedDetailedPoints = false;

    // From manual laps (structured workouts) - prefer these as they're cleaner
    if (activity.laps && activity.laps.length >= 2) {
      activity.laps.forEach(lap => {
        if (
          lap.distance >= 400 &&
          lap.moving_time >= 120 && // At least 2 min sustained
          lap.average_speed > 0 &&
          lap.average_heartrate &&
          lap.average_heartrate >= minHR &&
          lap.average_heartrate <= maxHR
        ) {
          dataPoints.push({
            speedMperMin: lap.average_speed * 60,
            hr: lap.average_heartrate,
            isTreadmill
          });
          addedDetailedPoints = true;
        }
      });
    }

    // From km splits - good for steady runs
    if (activity.splits_metric && activity.splits_metric.length >= 3) {
      activity.splits_metric.forEach((split: any) => {
        if (
          split.distance >= 800 &&
          split.average_speed > 0 &&
          split.average_heartrate &&
          split.average_heartrate >= minHR &&
          split.average_heartrate <= maxHR
        ) {
          dataPoints.push({
            speedMperMin: split.average_speed * 60,
            hr: split.average_heartrate,
            isTreadmill
          });
          addedDetailedPoints = true;
        }
      });
    }

    // Fallback: activity-level average when no detailed data is loaded yet.
    // Activity averages include warmup/cooldown so they underrepresent intensity.
    // Only use for harder efforts (avg HR >= 75% maxHR) where the warmup drag
    // is proportionally smaller and the estimate is more meaningful.
    // Easy runs (avg HR < 75% maxHR) are too noisy and underestimate VO2max.
    const activityMinHR = maxHR * 0.75;
    if (!addedDetailedPoints &&
        activity.average_heartrate &&
        activity.average_heartrate >= activityMinHR &&
        activity.average_heartrate <= maxHR &&
        activity.average_speed > 0 &&
        activity.moving_time >= 900 // at least 15 minutes
    ) {
      dataPoints.push({
        speedMperMin: activity.average_speed * 60,
        hr: activity.average_heartrate,
        isTreadmill
      });
    }
  });

  return dataPoints;
};

// Simple linear regression: y = slope * x + intercept
const linearRegression = (
  points: { x: number; y: number }[]
): { slope: number; intercept: number; r2: number } | null => {
  const n = points.length;
  if (n < 3) return null;

  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0);
  const sumY2 = points.reduce((s, p) => s + p.y * p.y, 0);

  const denom = n * sumX2 - sumX * sumX;
  if (Math.abs(denom) < 1e-10) return null;

  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;

  // R² calculation
  const meanY = sumY / n;
  const ssTotal = points.reduce((s, p) => s + Math.pow(p.y - meanY, 2), 0);
  const ssResidual = points.reduce((s, p) => s + Math.pow(p.y - (slope * p.x + intercept), 2), 0);
  const r2 = ssTotal > 0 ? 1 - ssResidual / ssTotal : 0;

  return { slope, intercept, r2 };
};

// Convert speed (m/min) to VO2 using Daniels' O2 Cost formula
const speedToVO2 = (speedMperMin: number): number => {
  return -4.60 + 0.182258 * speedMperMin + 0.000104 * Math.pow(speedMperMin, 2);
};

// Method 1: Firstbeat-style linear regression
// Regress speed vs HR, extrapolate to HRmax to find vVO2max
const estimateVDOTRegression = (
  dataPoints: SpeedHRDataPoint[],
  maxHR: number
): { vdot: number; r2: number; n: number } | null => {
  // Filter to outdoor only (treadmill GPS pace unreliable for regression)
  let points = dataPoints.filter(p => !p.isTreadmill);

  // If not enough outdoor data, include treadmill
  if (points.length < 6) {
    points = dataPoints;
  }

  if (points.length < 5) return null;

  // Build regression: HR (x) → speed (y)
  // We want to find: at HRmax, what speed can the runner sustain?
  const regData = points.map(p => ({ x: p.hr, y: p.speedMperMin }));
  const reg = linearRegression(regData);

  if (!reg || reg.r2 < 0.3) return null; // Poor fit, don't trust
  if (reg.slope <= 0) return null; // Speed should increase with HR

  // Extrapolate: what speed at HRmax?
  const speedAtHRmax = reg.slope * maxHR + reg.intercept;

  // Sanity check: speed at HRmax should be reasonable (3:00-8:00/km pace)
  // 3:00/km = 333 m/min, 8:00/km = 125 m/min
  if (speedAtHRmax < 125 || speedAtHRmax > 400) return null;

  // Convert speed at HRmax to VO2
  const vo2AtMax = speedToVO2(speedAtHRmax);

  // The speed-HR relationship is approximately linear at submaximal effort
  // but flattens near HRmax (cardiac drift, anaerobic contribution).
  // Linear extrapolation therefore OVERSHOOTS the true speed at HRmax.
  // Additionally, at HRmax a runner operates at ~95% VO2max (not 100%).
  // Combined correction: multiply by 0.92 to account for both effects.
  // This is conservative: 0.95 (non-linearity) × 0.97 (submaximal) ≈ 0.92
  const estimatedVO2max = vo2AtMax * 0.92;

  if (estimatedVO2max < 20 || estimatedVO2max > 85) return null;

  return { vdot: estimatedVO2max, r2: reg.r2, n: points.length };
};

// Treadmill speed correction:
// Running on a treadmill is easier than outdoor by ~3% due to no air resistance.
// 1% incline compensates fully; at 0% or 0.5% incline a modest correction is applied.
// This is used when treadmill data must be included as fallback.
const TREADMILL_SPEED_CORRECTION = 1.03;
const MIN_HARD_OUTDOOR_FOR_HRR = 5; // prefer outdoor; fall back to treadmill below this

// Method 2: %HRR = %VO2R per-segment (Swain et al. 1997)
// Gold standard relationship: %HRR ≈ %VO2R (r=0.990)
const estimateVDOTFromHRR = (
  dataPoints: SpeedHRDataPoint[],
  maxHR: number,
  restingHR: number
): { vdot: number; n: number; usedTreadmill: boolean } | null => {
  if (!restingHR || restingHR <= 0) return null;

  const hrRange = maxHR - restingHR;
  if (hrRange <= 20) return null; // Unrealistic HR range

  // Only use segments with HR >= 70% HRR (hard effort)
  const minHRR = 0.70;

  // Prefer outdoor; include treadmill (with correction) only when there
  // aren't enough hard outdoor segments (e.g. treadmill-heavy runners)
  const outdoorPoints = dataPoints.filter(p => !p.isTreadmill);
  const hardOutdoor = outdoorPoints.filter(p =>
    (p.hr - restingHR) / hrRange >= minHRR
  );
  const useTreadmill = hardOutdoor.length < MIN_HARD_OUTDOOR_FOR_HRR;
  const candidatePoints = useTreadmill ? dataPoints : outdoorPoints;

  const vdotEstimates: number[] = [];

  candidatePoints.forEach(point => {
    const hrr = (point.hr - restingHR) / hrRange;
    if (hrr < minHRR || hrr > 1.0) return;

    // Apply speed correction for treadmill (no air resistance → easier)
    const effectiveSpeed = point.isTreadmill
      ? point.speedMperMin * TREADMILL_SPEED_CORRECTION
      : point.speedMperMin;

    // %HRR = %VO2R (Swain 1997): solve for VO2max
    const vo2rest = 3.5;
    const vo2AtPace = speedToVO2(effectiveSpeed);
    const estimatedVO2max = (vo2AtPace - vo2rest) / hrr + vo2rest;

    if (estimatedVO2max > 25 && estimatedVO2max < 80) {
      vdotEstimates.push(estimatedVO2max);
    }
  });

  if (vdotEstimates.length < 3) return null;

  // Use median for robustness against outliers
  vdotEstimates.sort((a, b) => a - b);
  const medianIndex = Math.floor(vdotEstimates.length / 2);
  const median = vdotEstimates.length % 2 === 0
    ? (vdotEstimates[medianIndex - 1] + vdotEstimates[medianIndex]) / 2
    : vdotEstimates[medianIndex];

  return { vdot: median, n: vdotEstimates.length, usedTreadmill: useTreadmill };
};

// Method 3: Fallback using Londeree equation (%HRmax → %VO2max)
// %VO2max = 1.408 × %HRmax - 45.1
// Less accurate than %HRR but doesn't require restingHR
// Note: Tends to overestimate for well-trained runners with low resting HR
const estimateVDOTFromHRmax = (
  dataPoints: SpeedHRDataPoint[],
  maxHR: number
): { vdot: number; n: number; usedTreadmill: boolean } | null => {
  const minHR = maxHR * 0.80;

  const outdoorPoints = dataPoints.filter(p => !p.isTreadmill);
  const hardOutdoor = outdoorPoints.filter(p => p.hr >= minHR);
  const useTreadmill = hardOutdoor.length < 3;
  const candidatePoints = useTreadmill ? dataPoints : outdoorPoints;

  const vdotEstimates: number[] = [];

  candidatePoints.forEach(point => {
    if (point.hr < minHR) return;

    const hrMaxPct = (point.hr / maxHR) * 100;
    const pctVO2max = (1.408 * hrMaxPct - 45.1) / 100;
    if (pctVO2max <= 0.4 || pctVO2max > 1.0) return;

    const effectiveSpeed = point.isTreadmill
      ? point.speedMperMin * TREADMILL_SPEED_CORRECTION
      : point.speedMperMin;

    const vo2AtPace = speedToVO2(effectiveSpeed);
    const estimatedVO2max = vo2AtPace / pctVO2max;

    if (estimatedVO2max > 25 && estimatedVO2max < 80) {
      vdotEstimates.push(estimatedVO2max);
    }
  });

  if (vdotEstimates.length < 3) return null;

  // Use median
  vdotEstimates.sort((a, b) => a - b);
  const medianIndex = Math.floor(vdotEstimates.length / 2);
  const median = vdotEstimates.length % 2 === 0
    ? (vdotEstimates[medianIndex - 1] + vdotEstimates[medianIndex]) / 2
    : vdotEstimates[medianIndex];

  return { vdot: median, n: vdotEstimates.length, usedTreadmill: useTreadmill };
};

// Main VDOT estimation from training data
// Combines regression + HRR methods for best accuracy
export const estimateVDOTFromTempo = (
  activities: StravaActivity[],
  maxHR: number,
  restingHR: number = 0
): number => {
  if (!maxHR || maxHR <= 0) return 0;

  const dataPoints = collectSpeedHRData(activities, maxHR);
  if (dataPoints.length < 3) return 0;

  // Try all methods and combine
  const regression = estimateVDOTRegression(dataPoints, maxHR);
  const hrrMethod = estimateVDOTFromHRR(dataPoints, maxHR, restingHR);
  const hrmaxMethod = estimateVDOTFromHRmax(dataPoints, maxHR);

  const estimates: { vdot: number; weight: number; method: string }[] = [];

  // HRR method: gold standard when restingHR is available (%HRR=%VO2R, r=0.990)
  // Reduce weight when treadmill data had to be used (less accurate)
  if (hrrMethod) {
    const baseWeight = hrrMethod.n >= 5 ? 3.0 : 2.0;
    const weight = hrrMethod.usedTreadmill ? baseWeight * 0.7 : baseWeight;
    estimates.push({ vdot: hrrMethod.vdot, weight, method: 'hrr' });
  }

  // Regression method: outdoor only (treadmill GPS speed unreliable for regression)
  // Weight based on R² quality
  if (regression && regression.r2 > 0.4) {
    const weight = regression.r2 >= 0.7 ? 2.0 : regression.r2 >= 0.5 ? 1.5 : 1.0;
    estimates.push({ vdot: regression.vdot, weight, method: 'regression' });
  }

  // HRmax fallback (Londeree): used when other methods unavailable
  // Systematically overestimates for trained runners with low resting HR
  // Reduce weight further if treadmill data was needed
  if (hrmaxMethod) {
    const baseWeight = estimates.length === 0 ? 2.0 : 0.5;
    const weight = hrmaxMethod.usedTreadmill ? baseWeight * 0.7 : baseWeight;
    estimates.push({ vdot: hrmaxMethod.vdot, weight, method: 'hrmax' });
  }

  if (estimates.length === 0) return 0;

  // Weighted average of all methods
  const totalWeight = estimates.reduce((s, e) => s + e.weight, 0);
  const weightedVDOT = estimates.reduce((s, e) => s + e.vdot * e.weight, 0) / totalWeight;

  return Math.max(0, Math.round(weightedVDOT * 10) / 10);
};

// ─────────────────────────────────────────────────────────────────
// JACK DANIELS TRAINING PACES (derived from VDOT)
// ─────────────────────────────────────────────────────────────────
// Each training zone corresponds to a % of VO2max (= VDOT):
//   E  (Easy/Recovery):  59–74% — conversational, aerobic base
//   M  (Marathon):       ~80%   — comfortably hard, marathon race pace
//   T  (Threshold/Tempo): 86%   — "comfortably hard", ~1hr race effort
//   I  (Interval):       ~98%   — vVO2max, 3–5 min reps
//   R  (Repetition):    ~105%   — speed/economy, short fast reps
//
// Solve pace from VO2 via Daniels O2 Cost: VO2 = -4.60 + 0.182258v + 0.000104v²
// Quadratic: 0.000104v² + 0.182258v - (VO2 + 4.60) = 0
// v = (-0.182258 + sqrt(0.182258² + 4*0.000104*(VO2+4.60))) / (2*0.000104)
// ─────────────────────────────────────────────────────────────────

const vo2ToSpeedMperMin = (vo2: number): number => {
  const a = 0.000104;
  const b = 0.182258;
  const c = -(vo2 + 4.60);
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return 0;
  return (-b + Math.sqrt(discriminant)) / (2 * a);
};

const speedToPaceStr = (speedMperMin: number): string => {
  if (speedMperMin <= 0) return '—';
  const secsPerKm = 1000 / speedMperMin * 60; // convert m/min → sec/km
  const mins = Math.floor(secsPerKm / 60);
  const secs = Math.round(secsPerKm % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}/km`;
};

export interface DanielsTrainingPaces {
  easy: string;       // E: ~65% VO2max (middle of easy range)
  marathon: string;   // M: ~80% VO2max
  threshold: string;  // T: ~86% VO2max
  interval: string;   // I: ~98% VO2max (vVO2max)
  repetition: string; // R: ~105% VO2max
}

export const getDanielsTrainingPaces = (vdot: number): DanielsTrainingPaces | null => {
  if (!vdot || vdot <= 0) return null;

  return {
    easy:       speedToPaceStr(vo2ToSpeedMperMin(vdot * 0.65)),
    marathon:   speedToPaceStr(vo2ToSpeedMperMin(vdot * 0.80)),
    threshold:  speedToPaceStr(vo2ToSpeedMperMin(vdot * 0.86)),
    interval:   speedToPaceStr(vo2ToSpeedMperMin(vdot * 0.98)),
    repetition: speedToPaceStr(vo2ToSpeedMperMin(vdot * 1.05)),
  };
};

// Calculate absolute HR zones (bpm) based on Max HR
export const calculateHRZones = (maxHR: number): { zone: string, min: number, max: number }[] => {
  if (!maxHR || maxHR <= 0) return [];
  
  return [
    { zone: "Z1 Recovery", min: Math.round(maxHR * 0.50), max: Math.round(maxHR * 0.65) },
    { zone: "Z2 Easy/Base", min: Math.round(maxHR * 0.65), max: Math.round(maxHR * 0.76) },
    { zone: "Z3 Tempo", min: Math.round(maxHR * 0.76), max: Math.round(maxHR * 0.85) },
    { zone: "Z4 Threshold", min: Math.round(maxHR * 0.85), max: Math.round(maxHR * 0.92) },
    { zone: "Z5 VO2max", min: Math.round(maxHR * 0.92), max: maxHR }
  ];
};
