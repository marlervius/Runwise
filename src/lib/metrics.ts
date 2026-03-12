import { StravaActivity, HeartRateZoneBucket, StravaSplitMetric } from "@/types/strava";

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

// Classify activity type using multiple signals:
// 1. Strava's workout_type tag (if manually set by user)
// 2. Lap structure — interval workouts have high pace variance between laps
// 3. Average HR % of maxHR — fallback when no structural data
export const classifyActivityType = (activity: StravaActivity, maxHR: number): string => {
  if (activity.workout_type === 1) return "Race";
  if (activity.workout_type === 3) return "Workout";

  // Check lap structure: structured workouts have alternating fast/slow laps
  // This catches threshold and interval sessions that Strava doesn't tag
  if (activity.laps && activity.laps.length >= 3) {
    const validLaps = activity.laps.filter(lap => lap.distance > 100 && lap.average_speed > 0);
    if (validLaps.length >= 3) {
      const speeds = validLaps.map(lap => lap.average_speed);
      const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
      const variance = speeds.reduce((sum, s) => sum + Math.pow(s - avgSpeed, 2), 0) / speeds.length;
      const cv = Math.sqrt(variance) / avgSpeed; // coefficient of variation

      // CV > 0.08 indicates significant pace variation → structured workout
      if (cv > 0.08) {
        // Check if hard laps reach threshold HR levels
        const maxLapHR = Math.max(...validLaps.filter(l => l.average_heartrate).map(l => l.average_heartrate!));
        if (maxHR > 0 && maxLapHR > 0) {
          const hardestPct = (maxLapHR / maxHR) * 100;
          if (hardestPct >= 90) return "Threshold / Intervals";
          if (hardestPct >= 82) return "Tempo / Intervals";
        }
        return "Workout";
      }
    }
  }

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
      .filter((s: StravaSplitMetric) => s.distance > 500)
      .map((s: StravaSplitMetric) => s.average_speed > 0 ? 1000 / s.average_speed : 0);
    
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

export const getGradeAdjustedSpeed = (split: StravaSplitMetric): number => {
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

export const calculateDecoupling = (
  splits: StravaSplitMetric[]
): { percentage: number; status: string; elevationAdjusted: boolean } | null => {
  if (!splits || splits.length < 4) return null;

  type SplitWithHeartRate = StravaSplitMetric & { average_heartrate: number };
  
  const validSplits = splits.filter(
    (s: StravaSplitMetric): s is SplitWithHeartRate =>
      s.distance > 500 &&
      s.average_speed > 0 &&
      typeof s.average_heartrate === "number" &&
      s.average_heartrate > 0
  );
  
  if (validSplits.length < 4) return null;

  const hasElevation = validSplits.some((s: StravaSplitMetric) => 
    s.elevation_difference !== undefined && s.elevation_difference !== null
  );
  
  const midpoint = Math.floor(validSplits.length / 2);
  const firstHalf = validSplits.slice(0, midpoint);
  const secondHalf = validSplits.slice(midpoint);
  
  const calcEF = (splitChunk: SplitWithHeartRate[]) => {
    const totalSpeed = splitChunk.reduce((sum: number, s: SplitWithHeartRate) => sum + getGradeAdjustedSpeed(s), 0);
    const totalHR = splitChunk.reduce((sum: number, s: SplitWithHeartRate) => sum + s.average_heartrate, 0);
    return (totalSpeed / splitChunk.length) / (totalHR / splitChunk.length);
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
  // Only include segments at moderate-to-hard intensity (>= 76% maxHR).
  // Easy/recovery segments (< 76% maxHR) produce unreliable VDOT estimates
  // because the HR-pace relationship is weakest at low intensity, and they
  // drag the regression line down causing unstable day-to-day estimates.
  const minHR = maxHR * 0.76;

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
      activity.splits_metric.forEach((split: StravaSplitMetric) => {
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

// Convert speed (m/min) to VO2 using Daniels' O2 Cost formula
const speedToVO2 = (speedMperMin: number): number => {
  return -4.60 + 0.182258 * speedMperMin + 0.000104 * Math.pow(speedMperMin, 2);
};

// Treadmill speed correction:
// Running on a treadmill is easier than outdoor by ~3% due to no air resistance.
// 1% incline compensates fully; at 0% or 0.5% incline a modest correction is applied.
const TREADMILL_SPEED_CORRECTION = 1.03;

// Estimate VDOT for a single activity using its segments
// Returns null if not enough quality data in this activity
const estimateVDOTForActivity = (
  activity: StravaActivity,
  maxHR: number,
  restingHR: number
): number | null => {
  const dataPoints = collectSpeedHRData([activity], maxHR);
  if (dataPoints.length < 1) return null;

  // Primary: HRR method (most accurate, requires restingHR)
  if (restingHR > 0) {
    const hrRange = maxHR - restingHR;
    if (hrRange > 20) {
      const minHRR = 0.70;
      const vo2rest = 3.5;
      const estimates: number[] = [];

      dataPoints.forEach(point => {
        const hrr = (point.hr - restingHR) / hrRange;
        if (hrr < minHRR || hrr > 1.0) return;

        const effectiveSpeed = point.isTreadmill
          ? point.speedMperMin * TREADMILL_SPEED_CORRECTION
          : point.speedMperMin;

        const vo2AtPace = speedToVO2(effectiveSpeed);
        const est = (vo2AtPace - vo2rest) / hrr + vo2rest;
        if (est > 25 && est < 80) estimates.push(est);
      });

      if (estimates.length >= 2) {
        estimates.sort((a, b) => a - b);
        const mid = Math.floor(estimates.length / 2);
        return estimates.length % 2 === 0
          ? (estimates[mid - 1] + estimates[mid]) / 2
          : estimates[mid];
      }
    }
  }

  // Fallback: Londeree equation (%HRmax → %VO2max)
  const minHR = maxHR * 0.80;
  const estimates: number[] = [];

  dataPoints.forEach(point => {
    if (point.hr < minHR) return;
    const hrMaxPct = (point.hr / maxHR) * 100;
    const pctVO2max = (1.408 * hrMaxPct - 45.1) / 100;
    if (pctVO2max <= 0.4 || pctVO2max > 1.0) return;

    const effectiveSpeed = point.isTreadmill
      ? point.speedMperMin * TREADMILL_SPEED_CORRECTION
      : point.speedMperMin;

    const est = speedToVO2(effectiveSpeed) / pctVO2max;
    if (est > 25 && est < 80) estimates.push(est);
  });

  if (estimates.length >= 2) {
    estimates.sort((a, b) => a - b);
    const mid = Math.floor(estimates.length / 2);
    return estimates.length % 2 === 0
      ? (estimates[mid - 1] + estimates[mid]) / 2
      : estimates[mid];
  }

  return null;
};

// Main VDOT estimation from training data
// Computes per-activity VDOT and takes the MEDIAN across recent quality sessions.
// This prevents a single hard or easy session from swinging the estimate.
export const estimateVDOTFromTempo = (
  activities: StravaActivity[],
  maxHR: number,
  restingHR: number = 0
): number => {
  if (!maxHR || maxHR <= 0) return 0;

  // Get per-activity VDOT estimates for activities with quality data
  const perActivityVDOTs: number[] = [];

  activities.forEach(activity => {
    const vdot = estimateVDOTForActivity(activity, maxHR, restingHR);
    if (vdot !== null) perActivityVDOTs.push(vdot);
  });

  if (perActivityVDOTs.length === 0) return 0;

  // Median of per-activity estimates = stable, resistant to one-off outliers
  perActivityVDOTs.sort((a, b) => a - b);
  const mid = Math.floor(perActivityVDOTs.length / 2);
  const median = perActivityVDOTs.length % 2 === 0
    ? (perActivityVDOTs[mid - 1] + perActivityVDOTs[mid]) / 2
    : perActivityVDOTs[mid];

  return Math.max(0, Math.round(median * 10) / 10);
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

  // Percentages tuned to match practical training paces:
  // - E slightly slower than pure Daniels (most runners benefit from easier easy)
  // - T/I/R slightly conservative to avoid overreaching in training
  // These match the middle of each Daniels zone rather than the fast end.
  return {
    easy:       speedToPaceStr(vo2ToSpeedMperMin(vdot * 0.62)),  // ~62% (conservative easy)
    marathon:   speedToPaceStr(vo2ToSpeedMperMin(vdot * 0.78)),  // ~78% (sustainable MP)
    threshold:  speedToPaceStr(vo2ToSpeedMperMin(vdot * 0.84)),  // ~84% (practical tempo)
    interval:   speedToPaceStr(vo2ToSpeedMperMin(vdot * 0.95)),  // ~95% (sustainable I-pace)
    repetition: speedToPaceStr(vo2ToSpeedMperMin(vdot * 1.02)),  // ~102% (controlled R-pace)
  };
};

// ═══════════════════════════════════════════════════════════════
//  SPIKE-DETEKSJON: 10%-regel for enkeltøkt-lengde
//  Ref: Stordataanalyse av 5000+ løpere (arkitekturdokumentet)
//  "Den største skaderisikoen ikke nødvendigvis ligger i totalvolumet,
//   men i brå økninger i lengden på enkeltøkter."
// ═══════════════════════════════════════════════════════════════

export interface SpikeRisk {
  longestRunLast30Days: number; // km
  safeMaxSingleRun: number;     // km (110% av lengste)
  hasSpike: boolean;
  spikeActivityId?: number;
  spikeDistanceKm?: number;
}

/**
 * Detekterer om noen av de siste aktivitetene er et spike
 * (> 110% av den lengste turen i foregående 30 dager).
 * Brukes til å begrense planlagte langturer.
 */
export const detectSingleSessionSpike = (activities: StravaActivity[]): SpikeRisk => {
  if (!activities || activities.length === 0) {
    return { longestRunLast30Days: 0, safeMaxSingleRun: 0, hasSpike: false };
  }

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Finn lengste tur de siste 30 dagene (ekskl. i dag)
  const todayStr = now.toISOString().split("T")[0];
  const past30 = activities.filter(a => {
    const d = new Date(a.start_date_local);
    return d >= thirtyDaysAgo && a.start_date_local.split("T")[0] !== todayStr;
  });

  if (past30.length === 0) {
    return { longestRunLast30Days: 0, safeMaxSingleRun: 0, hasSpike: false };
  }

  const longestRunLast30Days = Math.max(...past30.map(a => a.distance / 1000));
  const safeMaxSingleRun = longestRunLast30Days * 1.10;

  // Sjekk siste aktivitet
  const latest = activities[0];
  const latestKm = latest.distance / 1000;
  const hasSpike = longestRunLast30Days > 0 && latestKm > safeMaxSingleRun;

  return {
    longestRunLast30Days: Math.round(longestRunLast30Days * 10) / 10,
    safeMaxSingleRun: Math.round(safeMaxSingleRun * 10) / 10,
    hasSpike,
    spikeActivityId: hasSpike ? latest.id : undefined,
    spikeDistanceKm: hasSpike ? Math.round(latestKm * 10) / 10 : undefined,
  };
};

// ═══════════════════════════════════════════════════════════════
//  AVVIK-ANALYSE: Algoritme for tapte treningsøkter
//  Ref: arkitekturdokumentet — tre nivåer (1-2d, 3-7d, >7d)
// ═══════════════════════════════════════════════════════════════

export type MissedTrainingLevel = "none" | "short" | "medium" | "long";

export interface MissedTrainingAnalysis {
  /** Antall sammenhengende dager uten løpeøkt */
  consecutiveRestDays: number;
  /** Klassifisering av fraværet */
  level: MissedTrainingLevel;
  /** Siste aktivitetsdato */
  lastActivityDate: string | null;
  /**
   * Anbefalte justeringer til plangeneratoren:
   * - none:   Ingen endring
   * - short:  Forskyv/dropp nøkkeløkter, ingen innhenting
   * - medium: Volum-redistribusjon 50-75% over 3-4 uker
   * - long:   Krisenprotokoll — 30-50% volum ned, kun rolig E-sone i 3-14 dager,
   *           VDOT-nedjustering (4.25% pr. 7-13 d, 8% pr. 4 uker)
   */
  recommendation: string;
  /** Prosentvis VDOT-nedjustering (0 hvis ingen) */
  vdotAdjustmentPct: number;
  /** Anbefalt volumfaktor for plangeneratoren (0.0 – 1.0) */
  volumeFactor: number;
  /** Antall dager med kun rolige E-sone-løp i retur */
  easyOnlyDays: number;
}

/**
 * Analyserer gapet i treningsdata og returnerer anbefalte tiltak
 * for plangeneratoren i henhold til arkitekturdokumentets tre nivåer.
 */
export const analyzeMissedTraining = (activities: StravaActivity[]): MissedTrainingAnalysis => {
  const empty: MissedTrainingAnalysis = {
    consecutiveRestDays: 0,
    level: "none",
    lastActivityDate: null,
    recommendation: "Ingen avvik oppdaget. Fortsett planlagt trening.",
    vdotAdjustmentPct: 0,
    volumeFactor: 1.0,
    easyOnlyDays: 0,
  };

  if (!activities || activities.length === 0) return empty;

  const sorted = [...activities].sort(
    (a, b) => new Date(b.start_date_local).getTime() - new Date(a.start_date_local).getTime()
  );

  const lastActivity = sorted[0];
  const lastDate = new Date(lastActivity.start_date_local);
  const now = new Date();
  const consecutiveRestDays = Math.floor(
    (now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  const lastActivityDate = lastDate.toISOString().split("T")[0];

  // Nivå 1: 1-2 dagers fravær — ingen reell fysiologisk forfall
  if (consecutiveRestDays <= 2) {
    return {
      ...empty,
      consecutiveRestDays,
      level: "none",
      lastActivityDate,
      recommendation:
        "Kort hvile (1-2 dager). Ingen fysiologisk forfall. Forskyv eventuelle nøkkeløkter, men ikke back-to-back. Planen kan justeres minimalt.",
    };
  }

  // Nivå 2: 3-7 dagers fravær — VDOT opprettholdes, volum-redistribusjon
  if (consecutiveRestDays <= 7) {
    // Hent inn 50-75% av tapt utholdenthetsvolum over 3-4 uker via +15-30 min/økt
    return {
      consecutiveRestDays,
      level: "short",
      lastActivityDate,
      recommendation:
        `${consecutiveRestDays} dager uten løping. VDOT opprettholdes. Utfør volum-redistribusjon: hent inn 50-75% av tapt volum over 3-4 uker via mikroskopiske økninger (+15-30 min/økt). Ingen rask innhenting.`,
      vdotAdjustmentPct: 0,
      volumeFactor: 0.85, // Litt redusert første uke tilbake
      easyOnlyDays: Math.ceil(consecutiveRestDays * 0.5), // halvparten av fraværet som rolige dager
    };
  }

  // Nivå 3: 8-13 dager — reelt fysiologisk forfall (~4.25%)
  if (consecutiveRestDays <= 13) {
    return {
      consecutiveRestDays,
      level: "medium",
      lastActivityDate,
      recommendation:
        `${consecutiveRestDays} dager uten løping. Reelt fysiologisk forfall (ca. 4% kondisjonsnedgang). Krisenprotokoll: ingen kvalitetstrening i returfasen, reduser volum med 30% første uke, kun rolige E-sone-løp de første ${Math.min(7, consecutiveRestDays)} dagene. Bygg gradvis tilbake over 2-3 uker.`,
      vdotAdjustmentPct: 4.25,
      volumeFactor: 0.70, // 30% reduksjon
      easyOnlyDays: Math.min(7, consecutiveRestDays),
    };
  }

  // Nivå 4: > 13 dager (2 uker+) — alvorlig forfall (~8%)
  return {
    consecutiveRestDays,
    level: "long",
    lastActivityDate,
    recommendation:
      `${consecutiveRestDays} dager uten løping. Alvorlig fysiologisk forfall (opptil 8% kondisjonsnedgang). Krisenprotokoll: reduser volum med 50%, INGEN intervaller eller terskeløkter de første 2 ukene. Kun rolige E-sone-løp de første 14 dagene. Bygg tålmodig tilbake over 3-6 uker med maksimalt 10% ukentlig volumøkning.`,
    vdotAdjustmentPct: Math.min(12, 4.25 + ((consecutiveRestDays - 13) / 14) * 4),
    volumeFactor: 0.50, // 50% reduksjon
    easyOnlyDays: 14,
  };
};

// ═══════════════════════════════════════════════════════════════
//  PERIODISERING: Treningsfase basert på tid til neste løp
//  Base → Build → Peak → Taper
// ═══════════════════════════════════════════════════════════════

export type TrainingPhase = "Base" | "Build" | "Peak" | "Taper" | "Maintenance";

export interface PeriodizationContext {
  phase: TrainingPhase;
  phaseNorwegian: string;
  weeksToRace: number | null;
  phaseDuration: string;
  volumeGuideline: string;
  intensityGuideline: string;
  focusDescription: string;
}

/**
 * Beregner hvilken treningsfase utøveren er i basert på
 * uker til neste løp. Uten løpsdato returneres "Maintenance".
 *
 * Periodiseringsmodell:
 *  > 16 uker:  Maintenance  — generell kondisjon, ingen spesifikk periodisering
 *  13-16 uker: Base         — aerob base, høyt volum, lav intensitet (80/20)
 *   9-12 uker: Build        — øker terskelarbeid og volum (70/30)
 *   5-8 uker:  Peak         — rase-spesifikk fart, høy intensitet (60/40)
 *   1-4 uker:  Taper        — volumreduksjon 20-40%, bevare fart
 */
export const getPeriodizationContext = (
  nextRaceDate: string | null | undefined,
  nextRaceDistance: string | null | undefined
): PeriodizationContext => {
  if (!nextRaceDate) {
    return {
      phase: "Maintenance",
      phaseNorwegian: "Vedlikehold",
      weeksToRace: null,
      phaseDuration: "Løpende",
      volumeGuideline: "Bygg gradvis volum (maks 10% per uke)",
      intensityGuideline: "80% rolig/lett (E-sone), 20% hardt (T/I)",
      focusDescription: "Generell kondisjonsforbedring uten spesifikt mål. Bygg aerob base og løpsøkonomi.",
    };
  }

  const raceDate = new Date(nextRaceDate);
  const now = new Date();
  const msToRace = raceDate.getTime() - now.getTime();
  const weeksToRace = Math.ceil(msToRace / (7 * 24 * 60 * 60 * 1000));

  // Taper: 1-3 uker ut fra distanse
  const taperWeeks = nextRaceDistance?.toLowerCase().includes("maraton") ? 3
    : nextRaceDistance?.toLowerCase().includes("halvmaraton") ? 2
    : 1;

  if (weeksToRace <= taperWeeks) {
    const volumeCut = weeksToRace === 1 ? "40%" : weeksToRace === 2 ? "30%" : "20%";
    return {
      phase: "Taper",
      phaseNorwegian: "Nedtrapping",
      weeksToRace,
      phaseDuration: `${weeksToRace} uke(r) til løpet`,
      volumeGuideline: `Reduser volum med ${volumeCut}. Bevar intensitet på nøkkeløktene.`,
      intensityGuideline: "Kortere enkeltøkter. Hold race-fart på noen drag. Mye hvile.",
      focusDescription: `Nedtrappingsfase — kroppen skal være frisk og klar til løpet. Reduser totalvolum men bevar løpsfølelse med kortere, skarpe drag på ${nextRaceDistance || "konkurransefart"}.`,
    };
  }

  if (weeksToRace <= 4 + taperWeeks) {
    return {
      phase: "Peak",
      phaseNorwegian: "Toppform",
      weeksToRace,
      phaseDuration: `${weeksToRace - taperWeeks} uke(r) igjen av toppfasen`,
      volumeGuideline: "Oppretthold eller lett reduksjon i volum. Prioriter kvalitetsøkter.",
      intensityGuideline: "60% rolig, 40% hardt (race-tempo og terskelfart dominerer)",
      focusDescription: `Toppformfase — spiss formen mot ${nextRaceDistance || "løpet"}. Race-spesifikke intervaller og terskeløkter på ${nextRaceDistance || "konkurransefart"}. Volumet stabiliseres.`,
    };
  }

  if (weeksToRace <= 8 + taperWeeks) {
    return {
      phase: "Build",
      phaseNorwegian: "Bygge",
      weeksToRace,
      phaseDuration: `${weeksToRace - taperWeeks} uke(r) igjen av byggefasen`,
      volumeGuideline: "Øk ukevolum 5-8% per uke. Introduser progressive terskeløkter.",
      intensityGuideline: "70% rolig/lett, 30% hardt (terskel + intervall øker gradvis)",
      focusDescription: `Byggefase mot ${nextRaceDistance || "løpet"} om ${weeksToRace} uker. Øk progressivt terskelarbeid og totalvolum. Introduser løpsspesifikke intervaller.`,
    };
  }

  // > 12 + taper uker: Base
  return {
    phase: "Base",
    phaseNorwegian: "Grunnlag",
    weeksToRace,
    phaseDuration: `${weeksToRace - taperWeeks} uke(r) igjen av grunnlagsfasen`,
    volumeGuideline: "Bygg ukevolum jevnt. Fokus på høy aerob mengde (80% E-sone).",
    intensityGuideline: "80-85% rolig/lett (E-sone), 15-20% moderat (M/T-sone)",
    focusDescription: `Grunnlagsfase — ${weeksToRace} uker til ${nextRaceDistance || "løpet"}. Bygg aerob kapasitet og løpsøkonomi med høy mengde rolig løping. Minimal hard trening nå.`,
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

/** Map Strava's zone format ({ min, max }) to the internal HR zone format.
 *  Strava returns exactly 5 heart rate zones in ascending order.
 *  The last zone typically has max = -1 (meaning "no upper limit") — we replace it with maxHR.
 */
export const mapStravaZonesToHRZones = (
  stravaZones: { min: number; max: number }[],
  maxHR: number
): { zone: string; min: number; max: number }[] => {
  const labels = ["Z1 Recovery", "Z2 Easy/Base", "Z3 Tempo", "Z4 Threshold", "Z5 VO2max"];
  return stravaZones.slice(0, 5).map((z, i) => ({
    zone: labels[i] ?? `Z${i + 1}`,
    min: z.min,
    max: z.max === -1 || z.max >= 999 ? maxHR : z.max,
  }));
};
