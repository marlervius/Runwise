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
