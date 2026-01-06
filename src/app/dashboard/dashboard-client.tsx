"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Activity, Calendar, Clock, MapPin, Copy, Check, Timer, TrendingUp, BarChart3, Heart, Trophy, Zap, Sparkles, RefreshCw, Info, Gauge } from "lucide-react";
import { 
  SettingsDialog, 
  UserProfile, 
  DEFAULT_PROFILE, 
  loadProfileFromStorage 
} from "@/components/settings-dialog";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface StravaLap {
  id: number;
  name: string;
  elapsed_time: number;
  moving_time: number;
  distance: number;
  average_speed: number;
  max_speed: number;
  average_heartrate?: number;
  max_heartrate?: number;
  lap_index: number;
  total_elevation_gain?: number;
  split?: number; // index
}

interface StravaGear {
  id: string;
  name: string;
  primary: boolean;
  distance: number;
}

interface StravaActivity {
  name: string;
  start_date_local: string;
  distance: number;
  moving_time: number;
  total_elevation_gain: number;
  average_speed: number;
  max_speed: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  suffer_score?: number;
  description?: string;
  splits_metric?: any[];
  type?: string;
  sport_type?: string;
  best_efforts?: BestEffort[];
  trainer?: boolean;
  workout_type?: number;
  // New fields
  average_grade_adjusted_speed?: number; // GAP
  gear_id?: string;
  gear?: StravaGear;
  laps?: StravaLap[];
}

interface BestEffort {
  id: number;
  name: string;
  elapsed_time: number;
  moving_time: number;
  start_date: string;
  start_date_local: string;
  distance: number;
  pr_rank?: number;
}

interface HeartRateZoneBucket {
  min: number;
  max: number;
  time: number;
}

interface AthleteStats {
  all_run_totals: {
    count: number;
    distance: number;
    moving_time: number;
  };
  ytd_run_totals: {
    count: number;
    distance: number;
    moving_time: number;
  };
}

interface ChartDataPoint {
  date: string;
  fullDate: string;
  distance: number;
  hr: number | null;
  pace: string;
  isTreadmill: boolean;
  name: string;
}

interface DashboardClientProps {
  activities: StravaActivity[];
  athleteStats: AthleteStats | null;
  bestEfforts: BestEffort[];
  heartRateZones: HeartRateZoneBucket[];
}

// Zone colors for visualization
const ZONE_COLORS = [
  { bg: 'bg-gray-500', text: 'text-gray-300', label: 'Z1 Recovery' },
  { bg: 'bg-blue-500', text: 'text-blue-300', label: 'Z2 Endurance' },
  { bg: 'bg-green-500', text: 'text-green-300', label: 'Z3 Tempo' },
  { bg: 'bg-yellow-500', text: 'text-yellow-300', label: 'Z4 Threshold' },
  { bg: 'bg-red-500', text: 'text-red-300', label: 'Z5 VO2max' },
];

// RPE (Rate of Perceived Exertion) labels
const RPE_LABELS: Record<number, { label: string; color: string }> = {
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

// Detect running type based on workout_type, laps, and split variance
const detectRunningType = (activity: StravaActivity): { type: string; detected: boolean; hasStructure: boolean } => {
  // Check explicit workout types first
  if (activity.workout_type === 1) return { type: 'Race', detected: false, hasStructure: false };
  if (activity.workout_type === 2) return { type: 'Long Run', detected: false, hasStructure: false };
  if (activity.workout_type === 3) return { type: 'Intervals / Structured', detected: false, hasStructure: true };
  
  // Check if laps exist and have significant pace variance (manual lap presses = structured workout)
  if (activity.laps && activity.laps.length >= 2) {
    const lapPaces = activity.laps
      .filter(lap => lap.distance > 100) // Only consider substantial laps
      .map(lap => lap.average_speed > 0 ? 1000 / lap.average_speed : 0);
    
    if (lapPaces.length >= 2) {
      const avgPace = lapPaces.reduce((a, b) => a + b, 0) / lapPaces.length;
      const variance = lapPaces.reduce((sum, p) => sum + Math.pow(p - avgPace, 2), 0) / lapPaces.length;
      const stdDev = Math.sqrt(variance);
      
      // If std deviation > 20 seconds in laps, it's a structured workout
      if (stdDev > 20) {
        return { type: 'Intervals / Structured', detected: true, hasStructure: true };
      }
    }
    
    // Multiple laps with similar paces = tempo or threshold
    if (activity.laps.length >= 3) {
      return { type: 'Structured Session', detected: true, hasStructure: true };
    }
  }
  
  // Fallback: Check pace variance in splits_metric
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
  
  // Check if it's a recovery run (very slow pace, low HR)
  if (activity.average_heartrate && activity.average_heartrate < 140) {
    return { type: 'Recovery Run', detected: true, hasStructure: false };
  }
  
  return { type: 'Steady Run', detected: true, hasStructure: false };
};

// Calculate Aerobic Decoupling (Cardiac Drift)
const calculateDecoupling = (splits: any[]): { percentage: number; status: string } | null => {
  if (!splits || splits.length < 4) return null;
  
  // Filter valid splits with both pace and HR data
  const validSplits = splits.filter((s: any) => 
    s.distance > 500 && s.average_speed > 0 && s.average_heartrate > 0
  );
  
  if (validSplits.length < 4) return null;
  
  const midpoint = Math.floor(validSplits.length / 2);
  const firstHalf = validSplits.slice(0, midpoint);
  const secondHalf = validSplits.slice(midpoint);
  
  // Calculate Efficiency Factor (EF) = Speed / HR for each half
  const calcEF = (splits: any[]) => {
    const totalSpeed = splits.reduce((sum: number, s: any) => sum + s.average_speed, 0);
    const totalHR = splits.reduce((sum: number, s: any) => sum + s.average_heartrate, 0);
    return (totalSpeed / splits.length) / (totalHR / splits.length);
  };
  
  const ef1 = calcEF(firstHalf);
  const ef2 = calcEF(secondHalf);
  
  // Decoupling = (EF1 - EF2) / EF1 * 100
  const decoupling = ((ef1 - ef2) / ef1) * 100;
  
  let status: string;
  if (decoupling < 3) status = 'Excellent (aerobic)';
  else if (decoupling < 5) status = 'Good';
  else if (decoupling < 8) status = 'Moderate Drift';
  else status = 'High Drift (threshold+)';
  
  return { percentage: decoupling, status };
};

// Filter valid runs
const filterValidRuns = (activities: StravaActivity[]): StravaActivity[] => {
  return activities.filter(activity => {
    const hasMinDistance = activity.distance > 500;
    const hasMinSpeed = activity.average_speed > 0.83;
    const isRunType = !activity.type || 
      activity.type.toLowerCase().includes('run') || 
      activity.sport_type?.toLowerCase().includes('run');
    return hasMinDistance && hasMinSpeed && isRunType;
  });
};

// Helper functions for formatting
const formatDuration = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const formatDurationLong = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const formatPace = (speedMs: number): string => {
  if (speedMs === 0) return "0:00";
  const secondsPerKm = 1000 / speedMs;
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.floor(secondsPerKm % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const formatShortDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const formatPRDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// Get workout type label
const getWorkoutTypeLabel = (activity: StravaActivity): string => {
  if (activity.trainer) {
    return "🏠 Treadmill";
  }
  
  switch (activity.workout_type) {
    case 1: return "🏁 Race";
    case 2: return "📏 Long Run";
    case 3: return "💪 Workout";
    default: return "🏃 Outdoor";
  }
};

// Get short workout indicator
const getWorkoutIndicator = (activity: StravaActivity): string => {
  if (activity.trainer) return "🏠";
  switch (activity.workout_type) {
    case 1: return "🏁";
    case 2: return "📏";
    case 3: return "💪";
    default: return "🌳";
  }
};

// Prepare data for the chart
const prepareChartData = (activities: StravaActivity[]): ChartDataPoint[] => {
  return [...activities].reverse().map(activity => ({
    date: formatShortDate(activity.start_date_local),
    fullDate: new Date(activity.start_date_local).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric'
    }),
    distance: parseFloat((activity.distance / 1000).toFixed(2)),
    hr: activity.average_heartrate ? Math.round(activity.average_heartrate) : null,
    pace: formatPace(activity.average_speed),
    name: activity.name,
    isTreadmill: activity.trainer || false,
  }));
};

// Calculate training load for last 7 days
const calculateTrainingLoad = (activities: StravaActivity[]) => {
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

// Filter and format PRs for key distances
const getKeyPRs = (bestEfforts: BestEffort[]) => {
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

// Format zones for display and prompt
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

// Generate history table
const generateHistoryTable = (history: StravaActivity[]): string => {
  if (history.length === 0) return "No previous activities available.";
  
  let table = "| Date | Location | Type | Dist (km) | Pace | Avg HR |\n";
  table += "|------|----------|------|-----------|------|--------|\n";
  
  history.forEach(activity => {
    const date = formatShortDate(activity.start_date_local);
    const location = activity.trainer ? "Treadmill" : "Outdoor";
    const type = activity.workout_type === 1 ? "Race" : 
                 activity.workout_type === 2 ? "Long" : 
                 activity.workout_type === 3 ? "Workout" : "Easy";
    const dist = (activity.distance / 1000).toFixed(1);
    const pace = formatPace(activity.average_speed);
    const hr = activity.average_heartrate ? Math.round(activity.average_heartrate).toString() : "-";
    
    table += `| ${date} | ${location} | ${type} | ${dist} | ${pace} | ${hr} |\n`;
  });
  
  return table;
};

// Guess lap type based on pace and HR patterns
const guessLapType = (lap: StravaLap, avgSessionPace: number): string => {
  const lapPaceSeconds = lap.average_speed > 0 ? 1000 / lap.average_speed : 0;
  const paceRatio = lapPaceSeconds / avgSessionPace;
  
  // Check lap name first (Strava sometimes labels them)
  if (lap.name) {
    const nameLower = lap.name.toLowerCase();
    if (nameLower.includes('warm') || nameLower.includes('wu')) return '🔥 Warmup';
    if (nameLower.includes('cool') || nameLower.includes('cd')) return '❄️ Cooldown';
    if (nameLower.includes('rest') || nameLower.includes('recovery')) return '😮‍💨 Recovery';
    if (nameLower.includes('interval') || nameLower.includes('rep')) return '⚡ Interval';
  }
  
  // Heuristic based on pace relative to session average
  if (paceRatio > 1.15) return '😮‍💨 Recovery';
  if (paceRatio < 0.92) return '⚡ Hard';
  return ''; // Normal pace, no label
};

// Format laps for structured workouts (manual lap button presses)
const formatLaps = (laps: StravaLap[], sessionAvgSpeed: number): string => {
  if (!laps || laps.length === 0) return "";
  
  // Calculate session average pace in seconds/km
  const avgSessionPace = sessionAvgSpeed > 0 ? 1000 / sessionAvgSpeed : 0;
  
  let text = "\n[WORKOUT STRUCTURE (Manual Laps)]\n";
  text += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
  
  laps.forEach((lap, index) => {
    const lapPace = formatPace(lap.average_speed);
    const lapTime = formatDuration(lap.elapsed_time);
    const lapDist = (lap.distance / 1000).toFixed(2);
    const lapType = guessLapType(lap, avgSessionPace);
    
    const hrInfo = lap.average_heartrate 
      ? `HR: ${Math.round(lap.average_heartrate)} | Max: ${Math.round(lap.max_heartrate || 0)}`
      : "HR: -";
    
    const elevInfo = lap.total_elevation_gain && lap.total_elevation_gain > 5 
      ? ` | +${Math.round(lap.total_elevation_gain)}m` 
      : "";
    
    text += `Lap ${index + 1}: ${lapTime} | ${lapDist} km | ${lapPace}/km | ${hrInfo}${elevInfo}`;
    if (lapType) text += ` ${lapType}`;
    text += "\n";
  });
  
  return text;
};

// Format splits for steady/unstructured runs
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

// Generate session data block (shared between both prompts)
const generateSessionData = (
  currentRun: StravaActivity,
  history: StravaActivity[],
  zones: HeartRateZoneBucket[],
  bestEfforts: BestEffort[],
  rpe: number
): string => {
  const date = new Date(currentRun.start_date_local).toLocaleDateString('en-US');
  const distanceKm = (currentRun.distance / 1000).toFixed(2);
  const duration = formatDuration(currentRun.moving_time);
  const avgPace = formatPace(currentRun.average_speed);

  // GAP (Grade Adjusted Pace)
  const hasGAP = currentRun.average_grade_adjusted_speed && 
                 currentRun.average_grade_adjusted_speed !== currentRun.average_speed;
  const gapPace = hasGAP 
    ? formatPace(currentRun.average_grade_adjusted_speed!)
    : null;

  const hrInfo = currentRun.average_heartrate
    ? `Avg ${Math.round(currentRun.average_heartrate)} bpm, Max ${Math.round(currentRun.max_heartrate || 0)} bpm`
    : "Not available";

  const cadenceInfo = currentRun.average_cadence
    ? `${Math.round(currentRun.average_cadence * 2)} spm`
    : "-";

  // Gear/Shoes
  const gearInfo = currentRun.gear?.name || (currentRun.gear_id ? `ID: ${currentRun.gear_id}` : "Not specified");

  // Detect running type with smart heuristics
  const runType = detectRunningType(currentRun);
  
  // Calculate decoupling (use splits for this calculation)
  const decoupling = calculateDecoupling(currentRun.splits_metric || []);

  // RPE info
  const rpeLabel = RPE_LABELS[rpe]?.label || 'Moderate';

  // Generate structure text: PRIORITIZE LAPS (manual) over SPLITS (auto)
  let structureText = "";
  const hasLaps = currentRun.laps && currentRun.laps.length > 0;
  const hasSplits = currentRun.splits_metric && currentRun.splits_metric.length > 0;

  if (hasLaps) {
    // Use manual laps - these represent the actual workout structure
    structureText = formatLaps(currentRun.laps!, currentRun.average_speed);
    
    // Also include auto splits as secondary data if it's a long structured workout
    if (hasSplits && runType.hasStructure && currentRun.splits_metric!.length > 3) {
      structureText += "\n" + formatSplits(currentRun.splits_metric!);
    }
  } else if (hasSplits) {
    // Fallback to auto splits if no manual laps
    structureText = formatSplits(currentRun.splits_metric!);
  }

  // Format zones
  const zonesText = formatZonesForPrompt(zones);

  // Format PRs
  const keyPRs = getKeyPRs(bestEfforts);
  let prsText = keyPRs.length > 0
    ? keyPRs.map(pr => `- ${pr.name}: ${pr.time}${pr.isPR ? ' 🏆 PR!' : ''}`).join('\n')
    : "None this session";

  // Calculate training load
  const allActivities = [currentRun, ...history];
  const load = calculateTrainingLoad(allActivities);
  
  // Generate history table
  const historyTable = generateHistoryTable(history);

  const location = currentRun.trainer ? "Treadmill" : "Outdoor";

  return `
SESSION: "${currentRun.name}"
Date: ${date} | Location: ${location}
Type: ${runType.type}${runType.detected ? ' (Auto-detected)' : ''}

ACTIVITY METRICS:
• Distance: ${distanceKm} km
• Duration: ${duration}
• Pace: ${avgPace}/km${gapPace ? ` | GAP: ${gapPace}/km` : ''}
• Heart Rate: ${hrInfo}
• Cadence: ${cadenceInfo}
• Elevation: +${Math.round(currentRun.total_elevation_gain)}m
• Shoes/Gear: ${gearInfo}
• RPE: ${rpe}/10 (${rpeLabel}) - User Input
${decoupling ? `• Aerobic Decoupling: ${decoupling.percentage.toFixed(1)}% (${decoupling.status})` : ''}
${currentRun.suffer_score ? `• Suffer Score: ${currentRun.suffer_score}` : ''}

HR ZONES:
${zonesText}
BEST EFFORTS:
${prsText}
${structureText}
LOAD (Last 7 Days): ${load.totalDistanceKm.toFixed(1)} km / ${load.totalHours.toFixed(1)} hrs / ${load.sessionsLast7Days} sessions

RECENT HISTORY:
${historyTable}`.trim();
};

// SYSTEM PROMPT - "Heavy" prompt for starting new chat
const generateSystemPrompt = (
  currentRun: StravaActivity, 
  history: StravaActivity[], 
  profile: UserProfile,
  zones: HeartRateZoneBucket[],
  bestEfforts: BestEffort[],
  rpe: number
): string => {
  const sessionData = generateSessionData(currentRun, history, zones, bestEfforts, rpe);

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

COACHING PHILOSOPHY:
- Prioritize consistency and injury prevention over short-term gains
- Use data-driven insights (HR zones, pace trends, VDOT estimation)
- Consider my personal constraints and injury history
- Provide actionable, specific recommendations

═══════════════════════════════════════════════════════════════
MY ATHLETE PROFILE
═══════════════════════════════════════════════════════════════

• Max Heart Rate: ${profile.maxHR} bpm
• Resting Heart Rate: ${profile.restingHR} bpm
• Lactate Threshold: ${profile.lactateThreshold}
• Primary Goal: ${profile.goal}
• Injury History: ${profile.injuryHistory}

═══════════════════════════════════════════════════════════════
INITIAL TRAINING DATA
═══════════════════════════════════════════════════════════════

${sessionData}

═══════════════════════════════════════════════════════════════
INITIAL ANALYSIS REQUEST
═══════════════════════════════════════════════════════════════

Please analyze this initial data and provide:

1. **Baseline Assessment**: Current fitness level and VDOT estimate
2. **Training Pattern**: What does my recent history tell you?
3. **Today's Session**: Brief analysis of the latest run
4. **Initial Recommendations**: 2-3 priorities for my training

After this, I will paste "Daily Update" messages with new sessions.
Keep responses concise but insightful.
`.trim();
};

// UPDATE PROMPT - "Light" prompt for ongoing sessions
const generateUpdatePrompt = (
  currentRun: StravaActivity,
  history: StravaActivity[],
  zones: HeartRateZoneBucket[],
  bestEfforts: BestEffort[],
  rpe: number
): string => {
  const sessionData = generateSessionData(currentRun, history, zones, bestEfforts, rpe);
  const allActivities = [currentRun, ...history];
  const load = calculateTrainingLoad(allActivities);

  return `
📅 DAILY TRAINING UPDATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Here is my latest training session. Based on our ongoing coaching thread and my profile history:

${sessionData}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
QUICK ANALYSIS REQUEST:

1. **Log & Compare**: How does this session fit into my recent pattern?
2. **Trend Check**: Any changes in my Pace/HR efficiency?
3. **Load Status**: Am I building appropriately (${load.totalDistanceKm.toFixed(1)} km last 7 days)?
4. **Next Session**: What should I focus on next?

Keep it brief - just the key insights.
`.trim();
};

// Custom Tooltip for the chart
const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 shadow-xl">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-white font-semibold">{data.name}</p>
          {data.isTreadmill && <span className="text-xs bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">🏠 Treadmill</span>}
        </div>
        <p className="text-slate-400 text-sm mb-2">{data.fullDate}</p>
        <div className="space-y-1 text-sm">
          <p className="text-indigo-400">Distance: {data.distance} km</p>
          <p className="text-emerald-400">Pace: {data.pace}/km</p>
          {data.hr && <p className="text-rose-400">Avg HR: {data.hr} bpm</p>}
        </div>
      </div>
    );
  }
  return null;
};

type PromptMode = 'setup' | 'daily';

export default function DashboardClient({ 
  activities, 
  athleteStats,
  bestEfforts,
  heartRateZones 
}: DashboardClientProps) {
  const [copied, setCopied] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [isLoaded, setIsLoaded] = useState(false);
  const [promptMode, setPromptMode] = useState<PromptMode>('daily');
  const [rpe, setRpe] = useState(5); // Rate of Perceived Exertion (1-10)

  // Filter valid runs first
  const validRuns = useMemo(() => filterValidRuns(activities), [activities]);
  
  // Split activities into current run and history
  const currentRun = validRuns[0];
  const history = validRuns.slice(1);
  
  // Prepare chart data
  const chartData = useMemo(() => prepareChartData(validRuns), [validRuns]);

  // Get key PRs
  const keyPRs = useMemo(() => getKeyPRs(bestEfforts), [bestEfforts]);

  // Calculate total zone time
  const totalZoneTime = useMemo(() => 
    heartRateZones.reduce((sum, z) => sum + z.time, 0), 
    [heartRateZones]
  );

  // Load profile from localStorage on mount
  useEffect(() => {
    const storedProfile = loadProfileFromStorage();
    setUserProfile(storedProfile);
    setIsLoaded(true);
  }, []);

  // Generate prompts dynamically based on mode and RPE
  const systemPrompt = useMemo(() => {
    if (!currentRun) return "";
    return generateSystemPrompt(currentRun, history, userProfile, heartRateZones, bestEfforts, rpe);
  }, [currentRun, history, userProfile, heartRateZones, bestEfforts, rpe]);

  const updatePrompt = useMemo(() => {
    if (!currentRun) return "";
    return generateUpdatePrompt(currentRun, history, heartRateZones, bestEfforts, rpe);
  }, [currentRun, history, heartRateZones, bestEfforts, rpe]);

  // Get the active prompt based on mode
  const activePrompt = promptMode === 'setup' ? systemPrompt : updatePrompt;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(activePrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleProfileSave = (newProfile: UserProfile) => {
    setUserProfile(newProfile);
  };

  // Calculate training load for display
  const load = useMemo(() => calculateTrainingLoad(validRuns), [validRuns]);

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  if (!currentRun) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950 text-white">
        <h2 className="text-xl">No valid running activities found.</h2>
      </div>
    );
  }

  // Safe formatting of dates
  const formattedDate = new Date(currentRun.start_date_local).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  // Calculate Pace (min/km)
  const paceMin = Math.floor(1000 / currentRun.average_speed / 60);
  const paceSec = Math.floor((1000 / currentRun.average_speed) % 60);
  const formattedPace = `${paceMin}:${paceSec.toString().padStart(2, '0')} /km`;

  // Calculate Duration
  const hours = Math.floor(currentRun.moving_time / 3600);
  const minutes = Math.floor((currentRun.moving_time % 3600) / 60);
  const seconds = currentRun.moving_time % 60;
  const formattedTime = `${hours > 0 ? hours + 'h ' : ''}${minutes}m ${seconds}s`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-12">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              Your Latest Run
            </h1>
            <p className="text-slate-400">
              AI analysis with {validRuns.length} valid sessions 
              {activities.length !== validRuns.length && (
                <span className="text-slate-500"> ({activities.length - validRuns.length} filtered out)</span>
              )}
            </p>
          </div>
          <SettingsDialog profile={userProfile} onSave={handleProfileSave} />
        </div>

        {/* Training Load Summary */}
        <Card className="bg-gradient-to-r from-indigo-900/30 to-purple-900/30 border-indigo-800/50 backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-6 justify-center flex-wrap">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-indigo-400" />
                <span className="text-slate-400 text-sm">Last 7 Days:</span>
                <span className="font-semibold text-white">{load.totalDistanceKm.toFixed(1)} km</span>
              </div>
              <div className="w-px h-6 bg-slate-700 hidden sm:block" />
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-purple-400" />
                <span className="font-semibold text-white">{load.totalHours.toFixed(1)} hours</span>
              </div>
              <div className="w-px h-6 bg-slate-700 hidden sm:block" />
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-pink-400" />
                <span className="font-semibold text-white">{load.sessionsLast7Days} sessions</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Heart Rate Zones */}
        {heartRateZones.length > 0 && totalZoneTime > 0 && (
          <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg text-white">
                <Heart className="w-5 h-5 text-rose-500" />
                Time in Heart Rate Zones
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {heartRateZones.map((zone, index) => {
                  const percentage = (zone.time / totalZoneTime) * 100;
                  const zoneConfig = ZONE_COLORS[index] || ZONE_COLORS[0];
                  return (
                    <div key={index} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className={zoneConfig.text}>{zoneConfig.label}</span>
                        <span className="text-slate-400">
                          {formatDurationLong(zone.time)} ({percentage.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div 
                          className={`h-full ${zoneConfig.bg} rounded-full transition-all duration-500`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Personal Records */}
        {keyPRs.length > 0 && (
          <Card className="bg-gradient-to-r from-amber-900/20 to-orange-900/20 border-amber-800/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg text-white">
                <Trophy className="w-5 h-5 text-amber-500" />
                Best Efforts This Run
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {keyPRs.map((pr, index) => (
                  <div 
                    key={index} 
                    className={`p-3 rounded-lg border ${
                      pr.isPR 
                        ? 'bg-amber-500/20 border-amber-500/50' 
                        : 'bg-slate-800/50 border-slate-700/50'
                    }`}
                  >
                    <div className="flex items-center gap-1 mb-1">
                      <span className="text-sm font-medium text-white">{pr.name}</span>
                      {pr.isPR && <Zap className="w-4 h-4 text-amber-400" />}
                    </div>
                    <div className="text-lg font-bold text-white">{pr.time}</div>
                    <div className="text-xs text-slate-400">{pr.date}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Training Trends Chart */}
        {chartData.length > 1 && (
          <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg text-white">
                <BarChart3 className="w-5 h-5 text-indigo-400" />
                Training Trends
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fill: '#94a3b8', fontSize: 12 }}
                      axisLine={{ stroke: '#475569' }}
                    />
                    <YAxis 
                      yAxisId="left"
                      tick={{ fill: '#94a3b8', fontSize: 12 }}
                      axisLine={{ stroke: '#475569' }}
                      label={{ value: 'km', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 12 }}
                    />
                    <YAxis 
                      yAxisId="right" 
                      orientation="right"
                      domain={['dataMin - 10', 'dataMax + 10']}
                      tick={{ fill: '#94a3b8', fontSize: 12 }}
                      axisLine={{ stroke: '#475569' }}
                      label={{ value: 'bpm', angle: 90, position: 'insideRight', fill: '#94a3b8', fontSize: 12 }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend 
                      wrapperStyle={{ paddingTop: '10px' }}
                      formatter={(value) => <span className="text-slate-300 text-sm">{value}</span>}
                    />
                    <Bar 
                      yAxisId="left"
                      dataKey="distance" 
                      name="Distance (km)"
                      fill="#6366f1" 
                      radius={[4, 4, 0, 0]}
                      opacity={0.8}
                    />
                    <Line 
                      yAxisId="right"
                      type="monotone" 
                      dataKey="hr" 
                      name="Avg HR (bpm)"
                      stroke="#f43f5e" 
                      strokeWidth={2}
                      dot={{ fill: '#f43f5e', strokeWidth: 2, r: 4 }}
                      connectNulls
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Grid */}
        <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl text-white">
              <Activity className="text-orange-500" />
              {currentRun.name}
              {currentRun.trainer && (
                <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-1 rounded-full font-normal">
                  🏠 Treadmill
                </span>
              )}
              {!currentRun.trainer && (
                <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-full font-normal">
                  🌳 Outdoor
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="space-y-1 bg-slate-800/50 p-4 rounded-lg border border-slate-700/50">
              <div className="flex items-center gap-2 text-slate-400 text-sm"><Calendar className="w-4 h-4" /> Date</div>
              <div className="font-semibold text-lg">{formattedDate}</div>
            </div>
            <div className="space-y-1 bg-slate-800/50 p-4 rounded-lg border border-slate-700/50">
              <div className="flex items-center gap-2 text-slate-400 text-sm"><MapPin className="w-4 h-4" /> Distance</div>
              <div className="font-semibold text-lg">{(currentRun.distance / 1000).toFixed(2)} km</div>
            </div>
            <div className="space-y-1 bg-slate-800/50 p-4 rounded-lg border border-slate-700/50">
              <div className="flex items-center gap-2 text-slate-400 text-sm"><Timer className="w-4 h-4" /> Pace</div>
              <div className="font-semibold text-lg">{formattedPace}</div>
            </div>
            <div className="space-y-1 bg-slate-800/50 p-4 rounded-lg border border-slate-700/50">
              <div className="flex items-center gap-2 text-slate-400 text-sm"><Clock className="w-4 h-4" /> Duration</div>
              <div className="font-semibold text-lg">{formattedTime}</div>
            </div>
          </CardContent>
        </Card>

        {/* AI Prompt Section */}
        <Card className="bg-slate-900/50 border-slate-800 shadow-2xl shadow-purple-900/10">
          <CardHeader className="space-y-4">
            <div className="flex flex-row items-center justify-between">
              <CardTitle className="text-white">AI Coaching Prompt</CardTitle>
              <Button 
                onClick={handleCopy}
                className={`transition-all duration-300 ${copied ? 'bg-green-600 hover:bg-green-700' : 'bg-purple-600 hover:bg-purple-700'}`}
              >
                {copied ? <><Check className="w-4 h-4 mr-2" /> Copied!</> : <><Copy className="w-4 h-4 mr-2" /> Copy Prompt</>}
              </Button>
            </div>
            
            {/* Mode Toggle Tabs */}
            <div className="flex gap-2">
              <button
                onClick={() => setPromptMode('setup')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  promptMode === 'setup'
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/25'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-300'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                Start New Chat
              </button>
              <button
                onClick={() => setPromptMode('daily')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  promptMode === 'daily'
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-300'
                }`}
              >
                <RefreshCw className="w-4 h-4" />
                Daily Update
              </button>
            </div>

            {/* Info Box */}
            <div className="flex items-start gap-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
              <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-slate-400">
                {promptMode === 'setup' ? (
                  <>
                    <span className="text-blue-400 font-medium">Start New Chat:</span> Use this ONCE to initialize your AI Coach with your full profile, training philosophy, and baseline data. This creates your coaching relationship.
                  </>
                ) : (
                  <>
                    <span className="text-indigo-400 font-medium">Daily Update:</span> Paste this into your EXISTING chat thread to add new sessions. The AI will remember your profile and track trends over time. This optimizes token usage for long-term coaching.
                  </>
                )}
              </div>
            </div>

            {/* RPE Slider */}
            <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700/50">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Gauge className="w-5 h-5 text-orange-400" />
                  <span className="text-white font-medium">Rate of Perceived Exertion (RPE)</span>
                </div>
                <div className={`text-lg font-bold ${RPE_LABELS[rpe]?.color || 'text-white'}`}>
                  {rpe}/10 - {RPE_LABELS[rpe]?.label || 'Moderate'}
                </div>
              </div>
              <div className="relative">
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={rpe}
                  onChange={(e) => setRpe(parseInt(e.target.value))}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
                  style={{
                    background: `linear-gradient(to right, 
                      #6b7280 0%, 
                      #3b82f6 30%, 
                      #22c55e 50%, 
                      #eab308 70%, 
                      #ef4444 100%)`
                  }}
                />
                <div className="flex justify-between text-xs text-slate-500 mt-1">
                  <span>1 - Very Light</span>
                  <span>5 - Moderate</span>
                  <span>10 - Max</span>
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                💡 How hard did this session FEEL? This subjective input helps the AI understand internal load vs. external metrics.
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <Textarea 
              readOnly 
              value={activePrompt} 
              className="min-h-[400px] bg-slate-950 border-slate-700 font-mono text-sm text-slate-300 resize-none focus-visible:ring-purple-500"
            />
            <p className="text-xs text-slate-500 mt-2 text-right">
              {promptMode === 'setup' ? '~Full system prompt' : '~Lightweight update'} • {activePrompt.length.toLocaleString()} characters
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
