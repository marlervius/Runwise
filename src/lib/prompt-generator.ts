import { StravaActivity, HeartRateZoneBucket, BestEffort, StravaLap } from "@/types/strava";
import { UserProfile } from "@/components/settings-dialog";
import { 
  calculateDecoupling, 
  classifyActivityType, 
  classifyByZones, 
  detectRunningType, 
  calculateTrainingLoad, 
  calculateWeeklyVolumes, 
  calculateConsistencyMetrics,
  getWorkoutStructure,
  getComparablePace,
  calculateACWR,
  analyzeShoeRotation,
  calculateHRZones,
  estimateVDOT,
  estimateVDOTFromTempo
} from "./metrics";
import { WeatherData } from "./weather";

// Zone colors and RPE labels
export const ZONE_COLORS = [
  { bg: 'bg-gray-500', text: 'text-gray-300', label: 'Z1 Recovery' },
  { bg: 'bg-blue-500', text: 'text-blue-300', label: 'Z2 Endurance' },
  { bg: 'bg-green-500', text: 'text-green-300', label: 'Z3 Tempo' },
  { bg: 'bg-yellow-500', text: 'text-yellow-300', label: 'Z4 Threshold' },
  { bg: 'bg-red-500', text: 'text-red-300', label: 'Z5 VO2max' },
];

export const RPE_LABELS: Record<number, { label: string; color: string }> = {
  1: { label: 'Very Light', color: 'text-gray-400' },
  2: { label: 'Light', color: 'text-gray-400' },
  3: { label: 'Light', color: 'text-blue-400' },
  4: { label: 'Moderate', color: 'text-blue-400' },
  5: { label: 'Moderate', color: 'text-green-400' },
  6: { label: 'Somewhat Hard', color: 'text-green-400' },
  7: { label: 'Hard', color: 'text-yellow-400' },
  8: { label: 'Hard', color: 'text-orange-400' },
  9: { label: 'Very Hard', color: 'text-red-400' },
  10: { label: 'Maximum', color: 'text-red-500' },
};

export const formatDuration = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

export const formatDurationLong = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

export const formatPace = (speedMs: number): string => {
  if (speedMs === 0) return "0:00";
  const secondsPerKm = 1000 / speedMs;
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.floor(secondsPerKm % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export const formatShortDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export const formatPRDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

export const getKeyPRs = (bestEfforts: BestEffort[]) => {
  const keyDistances = ['5k', '10k', 'Half-Marathon', 'Marathon'];
  const prs: { name: string; time: string; date: string; isPR: boolean }[] = [];
  
  keyDistances.forEach(distName => {
    const effort = bestEfforts.find(e => 
      e.name.toLowerCase() === distName.toLowerCase() ||
      e.name.toLowerCase().replace('-', '') === distName.toLowerCase().replace('-', '')
    );
    if (effort) {
      prs.push({
        name: distName,
        time: formatDuration(effort.elapsed_time),
        date: formatPRDate(effort.start_date_local),
        isPR: effort.pr_rank === 1,
      });
    }
  });
  
  return prs;
};

const formatZonesForPrompt = (zones: HeartRateZoneBucket[]): string => {
  if (!zones || zones.length === 0) return "Heart Rate Zone data not available.";
  
  let text = "";
  zones.forEach((zone, index) => {
    const label = ZONE_COLORS[index]?.label || `Zone ${index + 1}`;
    const timeStr = formatDurationLong(zone.time);
    const percentage = zones.reduce((sum, z) => sum + z.time, 0) > 0 
      ? ((zone.time / zones.reduce((sum, z) => sum + z.time, 0)) * 100).toFixed(0)
      : 0;
    text += `- ${label} (${zone.min}-${zone.max} bpm): ${timeStr} (${percentage}%)\n`;
  });
  
  return text;
};

// Estimate VDOT using two methods and take the highest:
// 1. Raw best efforts (Strava segments) — accurate for races, underestimates for training
// 2. Tempo/threshold adjustment — uses HR to identify threshold laps and adjusts for submaximal effort
const getEstimatedVDOT = (
  allTimeBestEfforts: BestEffort[],
  allActivities: StravaActivity[],
  maxHR: number,
  restingHR: number = 0
): { vdot: number; method: string } => {
  // Method 1: Raw best efforts (race results / Strava segments)
  let bestEffortVDOT = 0;
  if (allTimeBestEfforts && allTimeBestEfforts.length > 0) {
    allTimeBestEfforts.forEach(effort => {
      if (effort.distance >= 1500) {
        const vdot = estimateVDOT(effort.distance, effort.elapsed_time);
        if (vdot > bestEffortVDOT) bestEffortVDOT = vdot;
      }
    });
  }

  // Method 2: Training data analysis (regression + HRR + HRmax methods)
  const tempoVDOT = estimateVDOTFromTempo(allActivities, maxHR, restingHR);

  // Use the higher of the two estimates
  if (tempoVDOT > bestEffortVDOT && tempoVDOT > 0) {
    return { vdot: tempoVDOT, method: "training data analysis (HR-pace regression)" };
  }
  if (bestEffortVDOT > 0) {
    return { vdot: bestEffortVDOT, method: "best race/segment efforts" };
  }

  return { vdot: 0, method: "" };
};

const generateMicroProfile = (
  profile: UserProfile,
  allTimeBestEfforts: BestEffort[],
  allActivities: StravaActivity[]
): string => {
  let text = `[ATHLETE PHYSIOLOGY & RULES]\n`;
  text += `• Goal: ${profile.goal || 'Not specified'}\n`;

  if (profile.maxHR > 0) {
    text += `• Max HR: ${profile.maxHR} bpm | Resting: ${profile.restingHR || '?'} bpm\n`;
    text += `• Lactate Threshold: ${profile.lactateThreshold || 'Unknown'}\n`;

    const zones = calculateHRZones(profile.maxHR);
    if (zones.length > 0) {
      text += `• HR Zones (Absolute): ${zones.map(z => `${z.zone.split(' ')[0]}: ${z.min}-${z.max}`).join(', ')}\n`;
    }
  } else {
    text += `• Max HR: Unknown (Please estimate)\n`;
  }

  const { vdot, method } = getEstimatedVDOT(allTimeBestEfforts, allActivities, profile.maxHR || 0, profile.restingHR || 0);
  if (vdot > 0) {
    text += `• Est. Current VDOT: ~${vdot.toFixed(1)} (via ${method})\n`;
  }
  
  if (profile.injuryHistory) {
    text += `• Injury Notes: ${profile.injuryHistory}\n`;
  }
  
  return text;
};

const generateHistoryTable = (history: StravaActivity[], maxHR: number): string => {
  if (history.length === 0) return "No previous activities available.";

  let table = "| Date | Location | Type | Dist (km) | Pace | Avg HR | Notes |\n";
  table += "|------|----------|------|-----------|------|--------|-------|\n";

  history.forEach(activity => {
    const date = formatShortDate(activity.start_date_local);
    const location = activity.trainer ? "Treadmill" : "Outdoor";
    const type = classifyActivityType(activity, maxHR);
    const dist = (activity.distance / 1000).toFixed(1);
    const pace = formatPace(activity.average_speed);
    const hr = activity.average_heartrate ? Math.round(activity.average_heartrate).toString() : "-";
    const notes = activity.description && activity.description.trim().length > 0
      ? activity.description.trim().replace(/[\n\r]+/g, ' ').substring(0, 60) + (activity.description.trim().length > 60 ? '...' : '')
      : "-";

    table += `| ${date} | ${location} | ${type} | ${dist} | ${pace} | ${hr} | ${notes} |\n`;
  });

  return table;
};

const guessLapType = (lap: StravaLap, avgSessionPace: number): string => {
  const lapPaceSeconds = lap.average_speed > 0 ? 1000 / lap.average_speed : 0;
  const paceRatio = lapPaceSeconds / avgSessionPace;
  
  if (lap.name) {
    const nameLower = lap.name.toLowerCase();
    if (nameLower.includes('warm') || nameLower.includes('wu')) return '🔥 Warmup';
    if (nameLower.includes('cool') || nameLower.includes('cd')) return '❄️ Cooldown';
    if (nameLower.includes('rest') || nameLower.includes('recovery')) return '😮‍💨 Recovery';
    if (nameLower.includes('interval') || nameLower.includes('rep')) return '⚡ Interval';
  }
  
  if (paceRatio > 1.15) return '😮‍💨 Recovery';
  if (paceRatio < 0.92) return '⚡ Hard';
  return '';
};

const formatLaps = (laps: StravaLap[], sessionAvgSpeed: number, isTreadmill: boolean = false): string => {
  if (!laps || laps.length === 0) return "";
  
  const avgSessionPace = sessionAvgSpeed > 0 ? 1000 / sessionAvgSpeed : 0;
  
  let text = "\n[WORKOUT STRUCTURE (Manual Laps)]\n";
  if (isTreadmill) {
    text += "⚠️ TREADMILL: GPS pace/distance per lap is UNRELIABLE. Use activity-level pace (from treadmill calibration) as truth.\n";
    text += "   Lap HR data and time are still accurate and useful for analysis.\n";
  }
  text += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
  
  let lastWorkLapMaxHR: number | null = null;
  
  laps.forEach((lap, index) => {
    const lapPace = formatPace(lap.average_speed);
    const lapTime = formatDuration(lap.elapsed_time);
    const lapDist = (lap.distance / 1000).toFixed(2);
    const lapType = isTreadmill ? '' : guessLapType(lap, avgSessionPace);
    const isRestLap = lapType.includes('Recovery');
    const isWarmCool = lapType.includes('Warmup') || lapType.includes('Cooldown');
    
    const hrInfo = lap.average_heartrate 
      ? `HR: ${Math.round(lap.average_heartrate)} | Max: ${Math.round(lap.max_heartrate || 0)}`
      : "HR: -";
    
    if (isTreadmill) {
      let recoveryInfo = "";
      if (lastWorkLapMaxHR && lap.average_heartrate) {
        const hrDrop = lastWorkLapMaxHR - lap.average_heartrate;
        if (hrDrop > 10) {
          recoveryInfo = ` | HR Recovery: -${Math.round(hrDrop)} bpm (${Math.round(lastWorkLapMaxHR)} → ${Math.round(lap.average_heartrate)}) 😮‍💨 Rest`;
        }
      }
      
      let restNote = "";
      if (lap.elapsed_time > 0) {
        const standingTime = lap.elapsed_time - lap.moving_time;
        if (standingTime > 10) {
          restNote = ` | Standing rest: ${formatDuration(standingTime)}`;
        }
      }
      
      text += `Lap ${index + 1}: ${lapTime} | ${hrInfo}${recoveryInfo}${restNote}\n`;
      
      if (lap.max_heartrate && lap.average_heartrate) {
        const isLikelyWork = !lastWorkLapMaxHR || 
          (lap.average_heartrate > (lastWorkLapMaxHR - 15));
        if (isLikelyWork) {
          lastWorkLapMaxHR = lap.max_heartrate;
        }
      }
    } else {
      const elevInfo = lap.total_elevation_gain && lap.total_elevation_gain > 5 
        ? ` | +${Math.round(lap.total_elevation_gain)}m` 
        : "";
      
      let gapInfo = "";
      if (lap.total_elevation_gain && lap.total_elevation_gain > 3 && lap.distance > 100 && lap.average_speed > 0) {
        const gradePercent = (lap.total_elevation_gain / lap.distance) * 100;
        const actualPaceSeconds = 1000 / lap.average_speed;
        const gapAdjustment = gradePercent * 12;
        const gapSeconds = actualPaceSeconds - gapAdjustment;
        if (gapSeconds > 120 && gapAdjustment > 2) {
          const gapMin = Math.floor(gapSeconds / 60);
          const gapSec = Math.floor(gapSeconds % 60);
          gapInfo = ` | GAP: ~${gapMin}:${gapSec.toString().padStart(2, '0')}/km`;
        }
      }
      
      const isSlowerThanWork = lastWorkLapMaxHR !== null && (isRestLap || (
        !isWarmCool && lap.average_speed > 0 && avgSessionPace > 0 &&
        (1000 / lap.average_speed) > avgSessionPace * 1.05
      ));
      
      let recoveryInfo = "";
      if (isSlowerThanWork && lastWorkLapMaxHR && lap.average_heartrate) {
        const hrDrop = lastWorkLapMaxHR - lap.average_heartrate;
        if (hrDrop > 0) {
          recoveryInfo = ` | HR Recovery: -${Math.round(hrDrop)} bpm from prev peak (${Math.round(lastWorkLapMaxHR)} → ${Math.round(lap.average_heartrate)})`;
        }
      }

      let restNote = "";
      if ((isRestLap || isSlowerThanWork) && lap.elapsed_time > 0) {
        const standingTime = lap.elapsed_time - lap.moving_time;
        if (standingTime > 10) {
          restNote = ` | Standing rest: ${formatDuration(standingTime)}`;
        }
      }
      
      text += `Lap ${index + 1}: ${lapTime} | ${lapDist} km | ${lapPace}/km | ${hrInfo}${elevInfo}${gapInfo}${recoveryInfo}${restNote}`;
      if (lapType) text += ` ${lapType}`;
      text += "\n";
      
      const isWorkLap = !isRestLap && !isWarmCool && lap.average_speed > 0 &&
        (1000 / lap.average_speed) < avgSessionPace * 0.95 && lap.max_heartrate;
      if (isWorkLap) {
        lastWorkLapMaxHR = lap.max_heartrate!;
      }
    }
  });
  
  return text;
};

const formatSplits = (splits: any[]): string => {
  if (!splits || splits.length === 0) return "";
  
  let text = "\n[KM SPLITS (Auto)]\n";
  splits.forEach((split: any, index: number) => {
    if (split.distance < 100) return;
    const splitPace = formatPace(split.average_speed);
    const splitHr = split.average_heartrate ? `HR: ${Math.round(split.average_heartrate)}` : "";
    text += `Km ${index + 1}: ${formatDuration(split.elapsed_time)} | ${splitPace} | ${splitHr}\n`;
  });
  return text;
};

const calculateWorkLapHRDrift = (laps: StravaLap[], sessionAvgSpeed: number, isTreadmill: boolean = false): string => {
  if (!laps || laps.length < 3) return "";
  
  const avgSessionPace = sessionAvgSpeed > 0 ? 1000 / sessionAvgSpeed : 0;
  
  let workLaps: StravaLap[];
  
  if (isTreadmill) {
    const lapsWithHR = laps.filter(l => l.average_heartrate && l.average_heartrate > 0);
    if (lapsWithHR.length < 3) return "";
    const avgHR = lapsWithHR.reduce((sum, l) => sum + l.average_heartrate!, 0) / lapsWithHR.length;
    workLaps = lapsWithHR.filter(lap => lap.average_heartrate! > avgHR + 3);
  } else {
    workLaps = laps.filter(lap => {
      if (!lap.average_heartrate || lap.average_heartrate === 0) return false;
      if (lap.distance < 200) return false;
      const lapPaceSeconds = lap.average_speed > 0 ? 1000 / lap.average_speed : 0;
      const paceRatio = lapPaceSeconds / avgSessionPace;
      return paceRatio < 0.95;
    });
  }
  
  if (workLaps.length < 2) return "";
  
  let text = "\n[WORK LAP HR PROGRESSION]\n";
  if (isTreadmill) {
    text += "(Work laps identified by HR level - GPS pace unreliable on treadmill)\n";
  }
  
  workLaps.forEach((lap, index) => {
    if (isTreadmill) {
      text += `  Rep ${index + 1}: ${formatDuration(lap.elapsed_time)} | Avg HR: ${Math.round(lap.average_heartrate!)}`;
    } else {
      const pace = formatPace(lap.average_speed);
      text += `  Rep ${index + 1}: ${pace}/km | Avg HR: ${Math.round(lap.average_heartrate!)}`;
    }
    if (lap.max_heartrate) text += ` | Max: ${Math.round(lap.max_heartrate)}`;
    if (index > 0) {
      const delta = Math.round(lap.average_heartrate! - workLaps[index - 1].average_heartrate!);
      text += ` (${delta >= 0 ? '+' : ''}${delta})`;
    }
    text += "\n";
  });
  
  const firstHR = workLaps[0].average_heartrate!;
  const lastHR = workLaps[workLaps.length - 1].average_heartrate!;
  const totalDrift = Math.round(lastHR - firstHR);
  
  text += `→ Total drift across ${workLaps.length} work reps: ${totalDrift >= 0 ? '+' : ''}${totalDrift} bpm`;
  if (Math.abs(totalDrift) <= 2) text += " (Stable - excellent threshold endurance)";
  else if (totalDrift > 5) text += " (Significant drift - possible fatigue/overreaching)";
  else if (totalDrift > 3) text += " (Moderate drift - monitor closely)";
  else if (totalDrift < -2) text += " (Negative drift - still warming up or conservative start)";
  text += "\n";
  
  return text;
};

const formatWeeklyVolumesTable = (volumes: any[]): string => {
  if (volumes.length === 0) return "Not enough data for weekly breakdown.";
  
  let table = "| Week | Km | Hours | Sessions | Elev (m) |\n";
  table += "|------|------|-------|----------|----------|\n";
  
  volumes.forEach(w => {
    table += `| ${w.weekLabel} | ${w.km.toFixed(1)} | ${w.hours.toFixed(1)} | ${w.sessions} | +${Math.round(w.elevationGain)} |\n`;
  });
  
  if (volumes.length >= 2) {
    const current = volumes[0];
    const previous = volumes[1];
    
    if (previous.km > 0) {
      const wowChange = ((current.km - previous.km) / previous.km * 100);
      const wowDir = wowChange > 0 ? '↑' : wowChange < 0 ? '↓' : '→';
      table += `\nWeek-over-week: ${wowDir} ${Math.abs(wowChange).toFixed(0)}% (${previous.km.toFixed(1)} → ${current.km.toFixed(1)} km)`;
    }
    
    if (volumes.length >= 3) {
      const avgWeeks = volumes.slice(1, Math.min(5, volumes.length));
      const rollingAvg = avgWeeks.reduce((sum, w) => sum + w.km, 0) / avgWeeks.length;
      
      if (rollingAvg > 0) {
        const vsAvgChange = ((current.km - rollingAvg) / rollingAvg * 100);
        const vsAvgDir = vsAvgChange > 0 ? '↑' : vsAvgChange < 0 ? '↓' : '→';
        table += `\nVs ${avgWeeks.length}-week avg (${rollingAvg.toFixed(1)} km): ${vsAvgDir} ${Math.abs(vsAvgChange).toFixed(0)}%`;
        
        if (vsAvgChange > 10) {
          table += " ⚠️ (>10% above rolling average)";
        } else if (vsAvgChange <= 10 && vsAvgChange > 0) {
          table += " ✅ (safe progression)";
        }
      }
    }
  }
  
  return table;
};

const formatConsistencyMetrics = (metrics: any): string => {
  if (metrics.totalActivities === 0) return "Not enough data.";
  
  let text = "";
  text += `• Sessions (last 4 weeks): ${metrics.sessionsPerWeekLast4.join(', ')} per week\n`;
  text += `• Avg frequency: ${metrics.avgSessionsPerWeek} sessions/week\n`;
  text += `• Active days (last 28d): ${metrics.activeDaysLast28} | Rest days: ${metrics.restDaysLast28}\n`;
  text += `• Longest active streak: ${metrics.longestActiveStreak} consecutive days\n`;
  text += `• Longest rest period: ${metrics.longestRestStreak} consecutive days\n`;
  
  if (metrics.longestActiveStreak >= 7) {
    text += `⚠️ ${metrics.longestActiveStreak}+ days without rest - recovery concern\n`;
  }
  if (metrics.longestRestStreak >= 5) {
    text += `⚠️ ${metrics.longestRestStreak}+ consecutive rest days - consistency gap\n`;
  }
  
  return text;
};

const findSimilarWorkout = (current: StravaActivity, history: StravaActivity[], maxHR: number): string => {
  if (history.length === 0) return "";
  
  const currentDist = current.distance / 1000;
  const currentStructure = getWorkoutStructure(current);
  const currentIsTreadmill = current.trainer === true;
  
  let candidates = history.filter(a => {
    const dist = a.distance / 1000;
    const distRatio = Math.abs(dist - currentDist) / Math.max(currentDist, 0.1);
    const structure = getWorkoutStructure(a);
    const sameLocation = (a.trainer === true) === currentIsTreadmill;
    return distRatio < 0.25 && structure === currentStructure && sameLocation;
  });
  
  if (candidates.length === 0) {
    candidates = history.filter(a => {
      const structure = getWorkoutStructure(a);
      const sameLocation = (a.trainer === true) === currentIsTreadmill;
      return structure === currentStructure && sameLocation;
    });
  }
  
  if (candidates.length === 0) {
    candidates = history.filter(a => {
      const dist = a.distance / 1000;
      const distRatio = Math.abs(dist - currentDist) / Math.max(currentDist, 0.1);
      const structure = getWorkoutStructure(a);
      return distRatio < 0.25 && structure === currentStructure;
    });
  }

  if (candidates.length === 0) {
    candidates = history.filter(a => {
      const dist = a.distance / 1000;
      const distRatio = Math.abs(dist - currentDist) / Math.max(currentDist, 0.1);
      return distRatio < 0.25;
    });
  }
  
  if (candidates.length === 0) return "";
  
  const scored = candidates.map(a => {
    const dist = a.distance / 1000;
    const distScore = 1 - Math.abs(dist - currentDist) / Math.max(currentDist, 0.1);
    const structureScore = getWorkoutStructure(a) === currentStructure ? 1 : 0;
    const locationScore = (a.trainer === true) === currentIsTreadmill ? 1 : 0;
    const recency = new Date(a.start_date_local).getTime();
    return { activity: a, score: structureScore * 4 + locationScore * 3 + distScore * 2, recency };
  });
  
  scored.sort((a, b) => b.score - a.score || b.recency - a.recency);
  const similar = scored[0].activity;
  
  const similarDist = (similar.distance / 1000).toFixed(1);
  const similarHR = similar.average_heartrate ? Math.round(similar.average_heartrate) : null;
  const similarDate = formatShortDate(similar.start_date_local);
  const similarStructure = getWorkoutStructure(similar);
  const similarIsTreadmill = similar.trainer === true;

  const currentStructureLabel = currentStructure === 'structured' ? 'Structured' 
    : currentStructure === 'long_run' ? 'Long Run' 
    : currentStructure === 'race' ? 'Race' : 'Steady';
  
  const structureMatch = similarStructure === currentStructure;
  const locationMatch = similarIsTreadmill === currentIsTreadmill;
  let matchQuality: string;
  if (structureMatch && locationMatch) matchQuality = "exact match (same structure & location)";
  else if (structureMatch) matchQuality = "structure match, different location";
  else matchQuality = "approximate match";

  const currentPace = getComparablePace(current);
  const similarPace = getComparablePace(similar);
  
  const currentDistStr = currentDist.toFixed(1);
  const currentPaceStr = formatPace(currentPace.speed);
  const similarPaceStr = formatPace(similarPace.speed);
  const currentHR = current.average_heartrate ? Math.round(current.average_heartrate) : null;
  
  const currentLocation = currentIsTreadmill ? "🏠 Treadmill" : "🌳 Outdoor";
  const similarLocation = similarIsTreadmill ? "🏠 Treadmill" : "🌳 Outdoor";
  
  const currentElev = Math.round(current.total_elevation_gain || 0);
  const similarElev = Math.round(similar.total_elevation_gain || 0);
  
  let text = "\n[HISTORICAL COMPARISON]\n";
  text += `Comparing ${currentStructureLabel} sessions (${matchQuality}):\n`;
  text += `  Previous: "${similar.name}" (${similarDate}, ${similarLocation}) - ${similarDist} km | ${similarPaceStr}/km [${similarPace.label}]`;
  if (similarHR) text += ` | HR: ${similarHR}`;
  if (!similarIsTreadmill && similarElev > 10) text += ` | +${similarElev}m`;
  text += "\n";
  text += `  Current:  "${current.name}" (${currentLocation}) - ${currentDistStr} km | ${currentPaceStr}/km [${currentPace.label}]`;
  if (currentHR) text += ` | HR: ${currentHR}`;
  if (!currentIsTreadmill && currentElev > 10) text += ` | +${currentElev}m`;
  text += "\n";
  
  const currentPaceSec = currentPace.speed > 0 ? 1000 / currentPace.speed : 0;
  const similarPaceSec = similarPace.speed > 0 ? 1000 / similarPace.speed : 0;
  const paceDiff = currentPaceSec - similarPaceSec;
  const paceAbsDiff = Math.abs(paceDiff);
  const paceChange = paceDiff < -1 
    ? `${Math.round(paceAbsDiff)}s/km faster`
    : paceDiff > 1 
      ? `${Math.round(paceAbsDiff)}s/km slower`
      : "Same pace";
  
  text += `→ ${currentPace.label}: ${paceChange}`;
  
  if (currentHR && similarHR) {
    const hrDiff = currentHR - similarHR;
    text += ` | HR: ${hrDiff >= 0 ? '+' : ''}${hrDiff} bpm`;
    
    if (structureMatch && locationMatch) {
      if (paceDiff < -1 && hrDiff <= 0) text += " ✅ (Faster + lower HR = IMPROVING)";
      else if (paceDiff < -1 && hrDiff > 3) text += " (Faster but higher HR = pushing harder)";
      else if (Math.abs(paceDiff) <= 2 && hrDiff < -3) text += " ✅ (Same pace, lower HR = aerobic improvement)";
      else if (paceDiff > 2 && hrDiff > 0) text += " ⚠️ (Slower + higher HR = possible fatigue)";
    } else if (structureMatch && !locationMatch) {
      text += ` (⚠️ cross-location: ${similarLocation} → ${currentLocation} - pace not directly comparable)`;
    } else {
      text += " (⚠️ different workout structure - compare with caution)";
    }
  }
  text += "\n";
  
  return text;
};

export const generateSessionData = (
  currentRun: StravaActivity,
  history: StravaActivity[],
  zones: HeartRateZoneBucket[],
  bestEfforts: BestEffort[],
  rpe: number,
  maxHR: number,
  weather: WeatherData | null = null
): string => {
  const date = new Date(currentRun.start_date_local).toLocaleDateString('en-US');
  const distanceKm = (currentRun.distance / 1000).toFixed(2);
  const duration = formatDuration(currentRun.moving_time);
  const avgPace = formatPace(currentRun.average_speed);

  const hasGAP = !currentRun.trainer && currentRun.average_grade_adjusted_speed && 
                 currentRun.average_grade_adjusted_speed !== currentRun.average_speed;
  const gapPace = hasGAP ? formatPace(currentRun.average_grade_adjusted_speed!) : null;

  const hrInfo = currentRun.average_heartrate
    ? `Avg ${Math.round(currentRun.average_heartrate)} bpm, Max ${Math.round(currentRun.max_heartrate || 0)} bpm`
    : "Not available";

  const cadenceInfo = currentRun.average_cadence ? `${Math.round(currentRun.average_cadence * 2)} spm` : "-";
  const gearInfo = currentRun.gear?.name || (currentRun.gear_id ? `ID: ${currentRun.gear_id}` : "Not specified");
  
  const runType = detectRunningType(currentRun);
  const zoneClassification = zones.length > 0 
    ? classifyByZones(zones) 
    : { classification: classifyActivityType(currentRun, maxHR), breakdown: "" };
  
  const isTreadmill = currentRun.trainer === true;
  const decoupling = !isTreadmill ? calculateDecoupling(currentRun.splits_metric || []) : null;
  const rpeLabel = RPE_LABELS[rpe]?.label || 'Moderate';

  let structureText = "";
  const hasLaps = currentRun.laps && currentRun.laps.length > 0;
  const hasSplits = currentRun.splits_metric && currentRun.splits_metric.length > 0;

  if (hasLaps) {
    structureText = formatLaps(currentRun.laps!, currentRun.average_speed, isTreadmill);
    if (!isTreadmill && hasSplits && runType.hasStructure && currentRun.splits_metric!.length > 3) {
      structureText += "\n" + formatSplits(currentRun.splits_metric!);
    }
  } else if (hasSplits && !isTreadmill) {
    structureText = formatSplits(currentRun.splits_metric!);
  }

  const hrDriftText = hasLaps ? calculateWorkLapHRDrift(currentRun.laps!, currentRun.average_speed, isTreadmill) : "";
  const zonesText = formatZonesForPrompt(zones);
  
  const keyPRs = getKeyPRs(bestEfforts);
  let prsText = keyPRs.length > 0
    ? keyPRs.map(pr => `- ${pr.name}: ${pr.time}${pr.isPR ? ' 🏆 PR!' : ''}`).join('\n')
    : "None this session";

  const allActivities = [currentRun, ...history];
  const weeklyVolumes = calculateWeeklyVolumes(allActivities);
  const weeklyTable = formatWeeklyVolumesTable(weeklyVolumes);
  const consistency = calculateConsistencyMetrics(allActivities);
  const consistencyText = formatConsistencyMetrics(consistency);
  const comparisonText = findSimilarWorkout(currentRun, history, maxHR);
  const historyTable = generateHistoryTable(history, maxHR);
  
  const acwr = calculateACWR(allActivities);
  let acwrText = "";
  if (acwr) {
    acwrText = `\nINJURY RISK (ACWR):\n• Acute Load: ${acwr.acuteLoad.toFixed(1)} km (last 7d)\n• Chronic Load: ${acwr.chronicLoad.toFixed(1)} km/wk (last 28d)\n• Ratio: ${acwr.ratio.toFixed(2)} -> ${acwr.status}\n`;
  }

  const shoeStats = analyzeShoeRotation(allActivities);
  let shoeText = "";
  if (shoeStats.stats.length > 0) {
    shoeText = `\nSHOE ROTATION (Last 30 runs):\n`;
    shoeStats.stats.slice(0, 3).forEach(shoe => {
      shoeText += `• ${shoe.name}: ${shoe.percentageOfRuns.toFixed(0)}% of runs (${shoe.totalDistanceKm.toFixed(1)} km)\n`;
    });
    if (shoeStats.primaryShoeOverused) {
      shoeText += `⚠️ Primary shoe used for >85% of runs. Consider rotating shoes to reduce injury risk.\n`;
    }
  }

  const location = currentRun.trainer ? "Treadmill" : "Outdoor";
  const descriptionText = currentRun.description && currentRun.description.trim().length > 0
    ? `\nATHLETE NOTES: "${currentRun.description.trim()}"\n`
    : "";
    
  let weatherText = "";
  if (weather) {
    weatherText = `\nWEATHER CONDITIONS:\n• ${weather.condition}, ${Math.round(weather.temperature)}°C\n• Humidity: ${Math.round(weather.humidity)}%\n• Wind: ${weather.windSpeed.toFixed(1)} m/s (${weather.windDirection}°)\n`;
  }

  return `
SESSION: "${currentRun.name}"
Date: ${date} | Location: ${location}
Intensity: ${zoneClassification.classification} (Zone-based)${zoneClassification.breakdown ? ` [${zoneClassification.breakdown}]` : ''}
Structure: ${runType.type}${runType.detected ? ' (Auto-detected)' : ''}
${descriptionText}${weatherText}
ACTIVITY METRICS:
• Distance: ${distanceKm} km
• Duration: ${duration}
• Pace: ${avgPace}/km${gapPace ? ` | GAP (Grade Adjusted): ${gapPace}/km` : ''}
• Heart Rate: ${hrInfo}
• Cadence: ${cadenceInfo}
• Elevation: +${Math.round(currentRun.total_elevation_gain)}m
• Shoes/Gear: ${gearInfo}
• RPE: ${rpe}/10 (${rpeLabel}) - User Input
${decoupling ? `• Aerobic Decoupling: ${decoupling.percentage.toFixed(1)}% (${decoupling.status})${decoupling.elevationAdjusted ? ' [Elevation-adjusted using GAP]' : ' [No elevation data - raw pace]'}` : ''}
${currentRun.suffer_score ? `• Suffer Score: ${currentRun.suffer_score}` : ''}

HR ZONES (Time Distribution):
${zonesText}
BEST EFFORTS:
${prsText}
${structureText}${hrDriftText}${comparisonText}
WEEKLY VOLUME TREND:
${weeklyTable}
${acwrText}${shoeText}
CONSISTENCY (Last 4 weeks):
${consistencyText}
RECENT HISTORY:
${historyTable}`.trim();
};

export const generateSystemPrompt = (
  currentRun: StravaActivity,
  history: StravaActivity[],
  profile: UserProfile,
  zones: HeartRateZoneBucket[],
  bestEfforts: BestEffort[],
  rpe: number,
  weather: WeatherData | null = null,
  allTimeBestEfforts: BestEffort[] = []
): string => {
  const sessionData = generateSessionData(currentRun, history, zones, bestEfforts, rpe, profile.maxHR || 0, weather);

  return `
╔══════════════════════════════════════════════════════════════╗
║  🏃 RUNNING COACH AI - INITIAL SETUP                         ║
╚══════════════════════════════════════════════════════════════╝

*** ACT AS A WORLD-CLASS RUNNING COACH & EXERCISE PHYSIOLOGIST ***

You are my personal running coach. We will have an ongoing coaching relationship across multiple sessions. Your role is to:

1. **Track my training** - I will paste new session data regularly
2. **Analyze trends** - Monitor my fitness progression over time
3. **Manage load** - Watch for overtraining and injury risk
4. **Optimize performance** - Help me reach my goals efficiently

COACHING PHILOSOPHY & TONE:
- Personality: ${profile.aiPersonality || 'Supportive Coach'}
- Prioritize consistency and injury prevention over short-term gains
- Use data-driven insights (HR zones, pace trends, VDOT estimation)
- Consider my personal constraints and injury history
- Provide actionable, specific recommendations

═══════════════════════════════════════════════════════════════
MY ATHLETE PROFILE
═══════════════════════════════════════════════════════════════

${generateMicroProfile(profile, allTimeBestEfforts.length > 0 ? allTimeBestEfforts : bestEfforts, [currentRun, ...history])}

═══════════════════════════════════════════════════════════════
INITIAL TRAINING DATA
═══════════════════════════════════════════════════════════════

${sessionData}

═══════════════════════════════════════════════════════════════
INITIAL ANALYSIS REQUEST
═══════════════════════════════════════════════════════════════

Please analyze this initial data and provide:

1. **Baseline Assessment**: Current fitness level and VDOT estimate
2. **Training Pattern**: What does my weekly volume trend and consistency data tell you?
3. **Intensity Distribution**: Am I doing enough easy running? Is my polarized/pyramidal balance correct?
4. **Today's Session**: Brief analysis of the latest run (use zone classification, not just avg HR)
5. **Recovery Patterns**: Based on the consistency data, am I getting enough rest?
6. **Initial Recommendations**: 2-3 specific priorities for my training

IMPORTANT NOTES FOR ANALYSIS:
- Session intensity is classified by TIME IN HR ZONES, not average HR
- "Easy / Base" means 70%+ time in Z1-Z2. Trust this over average HR which can be misleading
- For structured workouts, check the WORK LAP HR PROGRESSION for threshold endurance
- Rest lap recovery data shows HR drop between intervals - use this to assess aerobic fitness
- The HISTORICAL COMPARISON section (if present) shows if I'm improving on similar sessions
- GAP (Grade Adjusted Pace) accounts for hills - use it when elevation is significant

🚨 ANTI-HALLUCINATION RULES (CRITICAL) 🚨:
- DO NOT calculate HR zones yourself. Use the [ATHLETE PHYSIOLOGY & RULES] absolute HR Zone table as truth.
- DO NOT invent or guess metrics like pace, distance, or HR if they are missing or say "0".
- DO NOT try to remember old workouts from our chat history. Use ONLY the "RECENT HISTORY" and "HISTORICAL COMPARISON" tables provided in this prompt as your source of truth.
- If data is missing to answer a question, explicitly state "Data not available" instead of making an assumption.

After this, I will paste "Daily Update" messages with new sessions.
Keep responses concise but insightful.
`.trim();
};

export const generateUpdatePrompt = (
  currentRun: StravaActivity,
  history: StravaActivity[],
  profile: UserProfile,
  zones: HeartRateZoneBucket[],
  bestEfforts: BestEffort[],
  rpe: number,
  weather: WeatherData | null = null,
  allTimeBestEfforts: BestEffort[] = []
): string => {
  const sessionData = generateSessionData(currentRun, history, zones, bestEfforts, rpe, profile.maxHR || 0, weather);

  return `
📅 DAILY TRAINING UPDATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Here is my latest training session. Based on our ongoing coaching thread and my profile history:

${generateMicroProfile(profile, allTimeBestEfforts.length > 0 ? allTimeBestEfforts : bestEfforts, [currentRun, ...history])}

${sessionData}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ANALYSIS REQUEST:

1. **Session Classification**: Verify the zone-based intensity label. Was this correctly classified?
2. **Trend Check**: Compare with the HISTORICAL COMPARISON data (if available). Am I improving?
3. **Weekly Load**: Review the WEEKLY VOLUME TREND. Is progression safe (<10% week-over-week)?
4. **Consistency**: Check rest day pattern. Any recovery concerns?
5. **Interval Quality** (if applicable): Check work lap HR drift and rest recovery data
6. **Next Session**: What should I focus on next given my weekly load and consistency?

🚨 ANTI-HALLUCINATION RULES (CRITICAL) 🚨:
- Keep the response brief (key insights only).
- DO NOT calculate HR zones yourself. Use the [ATHLETE PHYSIOLOGY & RULES] absolute HR Zone table above as absolute truth.
- DO NOT refer to workouts from older chat history. Rely ONLY on the tables in this prompt for trends.
`.trim();
};