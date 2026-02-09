"use client";

import { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Activity, Calendar, Clock, MapPin, Copy, Check, Timer, TrendingUp, BarChart3, Heart, Trophy, Zap, Sparkles, RefreshCw, Info, Gauge, History, ChevronLeft, ChevronRight } from "lucide-react";
import { 
  SettingsDialog, 
  UserProfile, 
  DEFAULT_PROFILE, 
  loadProfileFromStorage,
  hasStoredProfile
} from "@/components/settings-dialog";
import { ProTipsDialog } from "@/components/pro-tips-dialog";
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

// Classify activity type based on avg HR % of maxHR (fallback when zone data unavailable)
// Thresholds calibrated so that easy runs (e.g. HR 131 at maxHR 185 = 70.8%) are NOT mislabeled as Tempo
const classifyActivityType = (activity: StravaActivity, maxHR: number): string => {
  // Explicit Strava workout types take priority
  if (activity.workout_type === 1) return "Race";
  if (activity.workout_type === 3) return "Workout";

  // Need HR data and maxHR to classify
  if (!activity.average_heartrate || !maxHR || maxHR === 0) {
    return "Easy"; // fallback when no HR data available
  }

  const hrPercent = (activity.average_heartrate / maxHR) * 100;

  // Widened Easy zone to prevent mislabeling - most runners are in Z1-Z2 up to ~76% maxHR
  if (hrPercent < 65) return "Recovery";
  if (hrPercent < 76) return "Easy / Base";
  if (hrPercent < 85) return "Tempo";
  if (hrPercent < 92) return "Threshold";
  return "VO2max";
};

// Classify using HR zone TIME DISTRIBUTION (more accurate than avg HR)
// This uses the actual time spent in each zone, avoiding the "easy run labeled Tempo" problem
const classifyByZones = (zones: HeartRateZoneBucket[]): { classification: string; breakdown: string } => {
  const totalTime = zones.reduce((sum, z) => sum + z.time, 0);
  if (totalTime === 0) return { classification: "Unknown", breakdown: "" };
  
  const pct = zones.map(z => (z.time / totalTime) * 100);
  const easyPct = (pct[0] || 0) + (pct[1] || 0);   // Z1 + Z2
  const tempoPct = pct[2] || 0;                       // Z3
  const hardPct = (pct[3] || 0) + (pct[4] || 0);     // Z4 + Z5

  const breakdown = `Z1-2: ${easyPct.toFixed(0)}% | Z3: ${tempoPct.toFixed(0)}% | Z4-5: ${hardPct.toFixed(0)}%`;

  if (easyPct >= 70) return { classification: "Easy / Base", breakdown };
  if (easyPct >= 55 && hardPct < 10) return { classification: "Easy / Aerobic", breakdown };
  if (hardPct >= 30) return { classification: "Threshold / Intervals", breakdown };
  if (tempoPct >= 30) return { classification: "Tempo", breakdown };
  if (easyPct >= 45 && tempoPct >= 20) return { classification: "Moderate / Steady State", breakdown };
  return { classification: "Mixed Intensity", breakdown };
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
const generateHistoryTable = (history: StravaActivity[], maxHR: number): string => {
  if (history.length === 0) return "No previous activities available.";

  let table = "| Date | Location | Type | Dist (km) | Pace | Avg HR |\n";
  table += "|------|----------|------|-----------|------|--------|\n";

  history.forEach(activity => {
    const date = formatShortDate(activity.start_date_local);
    const location = activity.trainer ? "Treadmill" : "Outdoor";
    const type = classifyActivityType(activity, maxHR);
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
// Enhanced: identifies rest laps, shows recovery HR, GAP estimates
const formatLaps = (laps: StravaLap[], sessionAvgSpeed: number): string => {
  if (!laps || laps.length === 0) return "";
  
  // Calculate session average pace in seconds/km
  const avgSessionPace = sessionAvgSpeed > 0 ? 1000 / sessionAvgSpeed : 0;
  
  let text = "\n[WORKOUT STRUCTURE (Manual Laps)]\n";
  text += "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n";
  
  let lastWorkLapMaxHR: number | null = null;
  
  laps.forEach((lap, index) => {
    const lapPace = formatPace(lap.average_speed);
    const lapTime = formatDuration(lap.elapsed_time);
    const lapDist = (lap.distance / 1000).toFixed(2);
    const lapType = guessLapType(lap, avgSessionPace);
    const isRestLap = lapType.includes('Recovery');
    const isWarmCool = lapType.includes('Warmup') || lapType.includes('Cooldown');
    
    const hrInfo = lap.average_heartrate 
      ? `HR: ${Math.round(lap.average_heartrate)} | Max: ${Math.round(lap.max_heartrate || 0)}`
      : "HR: -";
    
    const elevInfo = lap.total_elevation_gain && lap.total_elevation_gain > 5 
      ? ` | +${Math.round(lap.total_elevation_gain)}m` 
      : "";
    
    // GAP estimate for any lap with elevation gain > 3m (especially important on work laps)
    let gapInfo = "";
    if (lap.total_elevation_gain && lap.total_elevation_gain > 3 && lap.distance > 100 && lap.average_speed > 0) {
      const gradePercent = (lap.total_elevation_gain / lap.distance) * 100;
      const actualPaceSeconds = 1000 / lap.average_speed;
      // ~12 sec/km per 1% grade (Strava-style GAP approximation)
      const gapAdjustment = gradePercent * 12;
      const gapSeconds = actualPaceSeconds - gapAdjustment;
      if (gapSeconds > 120 && gapAdjustment > 2) { // Only show if adjustment is meaningful (>2s)
        const gapMin = Math.floor(gapSeconds / 60);
        const gapSec = Math.floor(gapSeconds % 60);
        gapInfo = ` | GAP: ~${gapMin}:${gapSec.toString().padStart(2, '0')}/km`;
      }
    }
    
    // Recovery info: show on ANY lap that follows a work lap and is slower (rest/jog between reps)
    // This captures rest laps even if not explicitly labeled as "Recovery"
    const isSlowerThanWork = lastWorkLapMaxHR !== null && (isRestLap || (
      !isWarmCool && lap.average_speed > 0 && avgSessionPace > 0 &&
      (1000 / lap.average_speed) > avgSessionPace * 1.05 // at least 5% slower than session avg
    ));
    
    let recoveryInfo = "";
    if (isSlowerThanWork && lastWorkLapMaxHR && lap.average_heartrate) {
      const hrDrop = lastWorkLapMaxHR - lap.average_heartrate;
      if (hrDrop > 0) {
        recoveryInfo = ` | HR Recovery: -${Math.round(hrDrop)} bpm from prev peak (${Math.round(lastWorkLapMaxHR)} → ${Math.round(lap.average_heartrate)})`;
      }
    }

    // Standing rest detection (very little distance for elapsed time)
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
    
    // Track work lap HR: any lap that's faster than session average and not warmup/cooldown
    const isWorkLap = !isRestLap && !isWarmCool && lap.average_speed > 0 &&
      (1000 / lap.average_speed) < avgSessionPace * 0.95 && lap.max_heartrate;
    if (isWorkLap) {
      lastWorkLapMaxHR = lap.max_heartrate!;
    }
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

// Calculate HR drift across work laps in structured workouts
const calculateWorkLapHRDrift = (laps: StravaLap[], sessionAvgSpeed: number): string => {
  if (!laps || laps.length < 3) return "";
  
  const avgSessionPace = sessionAvgSpeed > 0 ? 1000 / sessionAvgSpeed : 0;
  
  // Identify work laps (faster than ~95% of session avg pace, with HR data, substantial distance)
  const workLaps = laps.filter(lap => {
    if (!lap.average_heartrate || lap.average_heartrate === 0) return false;
    if (lap.distance < 200) return false;
    const lapPaceSeconds = lap.average_speed > 0 ? 1000 / lap.average_speed : 0;
    const paceRatio = lapPaceSeconds / avgSessionPace;
    return paceRatio < 0.95; // Faster than session average
  });
  
  if (workLaps.length < 2) return "";
  
  let text = "\n[WORK LAP HR PROGRESSION]\n";
  
  workLaps.forEach((lap, index) => {
    const pace = formatPace(lap.average_speed);
    text += `  Rep ${index + 1}: ${pace}/km | Avg HR: ${Math.round(lap.average_heartrate!)}`;
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

// Helper: get Monday of the week for a given date (ISO week)
const getWeekStartMonday = (date: Date): Date => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
  return new Date(d.setDate(diff));
};

interface WeeklyVolume {
  weekStart: string;
  weekLabel: string;
  km: number;
  hours: number;
  sessions: number;
  elevationGain: number;
}

// Calculate weekly training volumes for the last 4-6 weeks
const calculateWeeklyVolumes = (activities: StravaActivity[]): WeeklyVolume[] => {
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

// Format weekly volumes as a Markdown table for the prompt
const formatWeeklyVolumesTable = (volumes: WeeklyVolume[]): string => {
  if (volumes.length === 0) return "Not enough data for weekly breakdown.";
  
  let table = "| Week | Km | Hours | Sessions | Elev (m) |\n";
  table += "|------|------|-------|----------|----------|\n";
  
  volumes.forEach(w => {
    table += `| ${w.weekLabel} | ${w.km.toFixed(1)} | ${w.hours.toFixed(1)} | ${w.sessions} | +${Math.round(w.elevationGain)} |\n`;
  });
  
  // Trend indicators: week-over-week AND vs 4-week rolling average
  if (volumes.length >= 2) {
    const current = volumes[0];
    const previous = volumes[1];
    
    // Week-over-week change
    if (previous.km > 0) {
      const wowChange = ((current.km - previous.km) / previous.km * 100);
      const wowDir = wowChange > 0 ? '↑' : wowChange < 0 ? '↓' : '→';
      table += `\nWeek-over-week: ${wowDir} ${Math.abs(wowChange).toFixed(0)}% (${previous.km.toFixed(1)} → ${current.km.toFixed(1)} km)`;
    }
    
    // 4-week rolling average comparison (more meaningful than single week)
    if (volumes.length >= 3) {
      const avgWeeks = volumes.slice(1, Math.min(5, volumes.length)); // weeks 2-5 (excluding current)
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

interface ConsistencyMetrics {
  totalActivities: number;
  weeksSpan: number;
  avgSessionsPerWeek: number;
  longestActiveStreak: number;
  longestRestStreak: number;
  restDaysLast28: number;
  activeDaysLast28: number;
  sessionsPerWeekLast4: number[];
}

// Calculate training consistency metrics
const calculateConsistencyMetrics = (activities: StravaActivity[]): ConsistencyMetrics => {
  const empty: ConsistencyMetrics = {
    totalActivities: 0, weeksSpan: 0, avgSessionsPerWeek: 0,
    longestActiveStreak: 0, longestRestStreak: 0,
    restDaysLast28: 28, activeDaysLast28: 0, sessionsPerWeekLast4: []
  };
  
  if (activities.length === 0) return empty;
  
  // Get unique activity dates
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
  
  // Calculate streaks
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
  
  // Last 28 days analysis
  const now = new Date();
  const twentyEightDaysAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000);
  let activeDaysLast28 = 0;
  activityDays.forEach(day => {
    if (new Date(day) >= twentyEightDaysAgo) activeDaysLast28++;
  });
  
  // Sessions per week for last 4 weeks
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

// Format consistency metrics for the prompt
const formatConsistencyMetrics = (metrics: ConsistencyMetrics): string => {
  if (metrics.totalActivities === 0) return "Not enough data.";
  
  let text = "";
  text += `• Sessions (last 4 weeks): ${metrics.sessionsPerWeekLast4.join(', ')} per week\n`;
  text += `• Avg frequency: ${metrics.avgSessionsPerWeek} sessions/week\n`;
  text += `• Active days (last 28d): ${metrics.activeDaysLast28} | Rest days: ${metrics.restDaysLast28}\n`;
  text += `• Longest active streak: ${metrics.longestActiveStreak} consecutive days\n`;
  text += `• Longest rest period: ${metrics.longestRestStreak} consecutive days\n`;
  
  // Flag potential issues
  if (metrics.longestActiveStreak >= 7) {
    text += `⚠️ ${metrics.longestActiveStreak}+ days without rest - recovery concern\n`;
  }
  if (metrics.longestRestStreak >= 5) {
    text += `⚠️ ${metrics.longestRestStreak}+ consecutive rest days - consistency gap\n`;
  }
  
  return text;
};

// Determine workout structure category for matching (more specific than intensity)
const getWorkoutStructure = (activity: StravaActivity): string => {
  if (activity.workout_type === 1) return "race";
  if (activity.workout_type === 3) return "structured";
  if (activity.workout_type === 2) return "long_run";
  // Heuristic: check if it has many laps with pace variance (structured without label)
  if (activity.laps && activity.laps.length >= 4) return "structured";
  return "steady";
};

// Find the most similar historical workout for comparison
// Matches on STRUCTURE (steady vs structured vs long run) + distance, NOT just intensity label
const findSimilarWorkout = (current: StravaActivity, history: StravaActivity[], maxHR: number): string => {
  if (history.length === 0) return "";
  
  const currentDist = current.distance / 1000;
  const currentStructure = getWorkoutStructure(current);
  
  // Priority 1: Same structure AND similar distance (within 25%)
  let candidates = history.filter(a => {
    const dist = a.distance / 1000;
    const distRatio = Math.abs(dist - currentDist) / Math.max(currentDist, 0.1);
    const structure = getWorkoutStructure(a);
    return distRatio < 0.25 && structure === currentStructure;
  });
  
  // Priority 2: Same structure, any distance (if no distance match)
  if (candidates.length === 0) {
    candidates = history.filter(a => getWorkoutStructure(a) === currentStructure);
  }
  
  // Priority 3: Similar distance regardless of structure (last resort)
  if (candidates.length === 0) {
    candidates = history.filter(a => {
      const dist = a.distance / 1000;
      const distRatio = Math.abs(dist - currentDist) / Math.max(currentDist, 0.1);
      return distRatio < 0.25;
    });
  }
  
  if (candidates.length === 0) return "";
  
  // Score candidates: prefer same distance + same structure + most recent
  const scored = candidates.map(a => {
    const dist = a.distance / 1000;
    const distScore = 1 - Math.abs(dist - currentDist) / Math.max(currentDist, 0.1);
    const structureScore = getWorkoutStructure(a) === currentStructure ? 1 : 0;
    const recency = new Date(a.start_date_local).getTime();
    return { activity: a, score: distScore * 2 + structureScore * 3, recency };
  });
  
  // Sort by score (desc), then recency (desc)
  scored.sort((a, b) => b.score - a.score || b.recency - a.recency);
  const similar = scored[0].activity;
  
  const similarDist = (similar.distance / 1000).toFixed(1);
  const similarPace = formatPace(similar.average_speed);
  const similarHR = similar.average_heartrate ? Math.round(similar.average_heartrate) : null;
  const similarDate = formatShortDate(similar.start_date_local);
  const similarType = classifyActivityType(similar, maxHR);
  const similarStructure = getWorkoutStructure(similar);
  const currentStructureLabel = currentStructure === 'structured' ? 'Structured' 
    : currentStructure === 'long_run' ? 'Long Run' 
    : currentStructure === 'race' ? 'Race' : 'Steady';
  const matchQuality = similarStructure === currentStructure ? "exact structure match" : "approximate match (different structure)";
  
  const currentDistStr = currentDist.toFixed(1);
  const currentPaceStr = formatPace(current.average_speed);
  const currentHR = current.average_heartrate ? Math.round(current.average_heartrate) : null;
  
  let text = "\n[HISTORICAL COMPARISON]\n";
  text += `Comparing ${currentStructureLabel} sessions (${matchQuality}):\n`;
  text += `  Previous: "${similar.name}" (${similarDate}) - ${similarDist} km | ${similarPace}/km`;
  if (similarHR) text += ` | HR: ${similarHR}`;
  text += "\n";
  text += `  Current:  "${current.name}" - ${currentDistStr} km | ${currentPaceStr}/km`;
  if (currentHR) text += ` | HR: ${currentHR}`;
  text += "\n";
  
  // Calculate pace difference (in seconds per km)
  const currentPaceSec = current.average_speed > 0 ? 1000 / current.average_speed : 0;
  const similarPaceSec = similar.average_speed > 0 ? 1000 / similar.average_speed : 0;
  const paceDiff = currentPaceSec - similarPaceSec; // positive = slower
  const paceAbsDiff = Math.abs(paceDiff);
  const paceChange = paceDiff < -1 
    ? `${Math.round(paceAbsDiff)}s/km faster`
    : paceDiff > 1 
      ? `${Math.round(paceAbsDiff)}s/km slower`
      : "Same pace";
  
  text += `→ Pace: ${paceChange}`;
  
  if (currentHR && similarHR) {
    const hrDiff = currentHR - similarHR;
    text += ` | HR: ${hrDiff >= 0 ? '+' : ''}${hrDiff} bpm`;
    
    // Only give efficiency verdict if structure matches well
    if (similarStructure === currentStructure) {
      if (paceDiff < -1 && hrDiff <= 0) text += " ✅ (Faster + lower HR = IMPROVING)";
      else if (paceDiff < -1 && hrDiff > 3) text += " (Faster but higher HR = pushing harder)";
      else if (Math.abs(paceDiff) <= 2 && hrDiff < -3) text += " ✅ (Same pace, lower HR = aerobic improvement)";
      else if (paceDiff > 2 && hrDiff > 0) text += " ⚠️ (Slower + higher HR = possible fatigue)";
    } else {
      text += " (⚠️ different workout structure - compare with caution)";
    }
  }
  text += "\n";
  
  return text;
};

// Generate session data block (shared between both prompts)
const generateSessionData = (
  currentRun: StravaActivity,
  history: StravaActivity[],
  zones: HeartRateZoneBucket[],
  bestEfforts: BestEffort[],
  rpe: number,
  maxHR: number
): string => {
  const date = new Date(currentRun.start_date_local).toLocaleDateString('en-US');
  const distanceKm = (currentRun.distance / 1000).toFixed(2);
  const duration = formatDuration(currentRun.moving_time);
  const avgPace = formatPace(currentRun.average_speed);

  // GAP (Grade Adjusted Pace) - session level
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

  // Detect running type (structure: intervals, steady, etc.)
  const runType = detectRunningType(currentRun);
  
  // Zone-based intensity classification (more accurate than avg HR)
  const zoneClassification = zones.length > 0 
    ? classifyByZones(zones) 
    : { classification: classifyActivityType(currentRun, maxHR), breakdown: "" };
  
  // Calculate decoupling (use splits for this calculation)
  const decoupling = calculateDecoupling(currentRun.splits_metric || []);

  // RPE info
  const rpeLabel = RPE_LABELS[rpe]?.label || 'Moderate';

  // Generate structure text: PRIORITIZE LAPS (manual) over SPLITS (auto)
  let structureText = "";
  const hasLaps = currentRun.laps && currentRun.laps.length > 0;
  const hasSplits = currentRun.splits_metric && currentRun.splits_metric.length > 0;

  if (hasLaps) {
    structureText = formatLaps(currentRun.laps!, currentRun.average_speed);
    
    if (hasSplits && runType.hasStructure && currentRun.splits_metric!.length > 3) {
      structureText += "\n" + formatSplits(currentRun.splits_metric!);
    }
  } else if (hasSplits) {
    structureText = formatSplits(currentRun.splits_metric!);
  }

  // Work lap HR drift (for structured workouts)
  const hrDriftText = hasLaps 
    ? calculateWorkLapHRDrift(currentRun.laps!, currentRun.average_speed) 
    : "";

  // Format zones
  const zonesText = formatZonesForPrompt(zones);

  // Format PRs
  const keyPRs = getKeyPRs(bestEfforts);
  let prsText = keyPRs.length > 0
    ? keyPRs.map(pr => `- ${pr.name}: ${pr.time}${pr.isPR ? ' 🏆 PR!' : ''}`).join('\n')
    : "None this session";

  // All activities for aggregate calculations
  const allActivities = [currentRun, ...history];
  
  // Weekly volume trend (4-6 weeks)
  const weeklyVolumes = calculateWeeklyVolumes(allActivities);
  const weeklyTable = formatWeeklyVolumesTable(weeklyVolumes);
  
  // Consistency metrics
  const consistency = calculateConsistencyMetrics(allActivities);
  const consistencyText = formatConsistencyMetrics(consistency);
  
  // Historical comparison
  const comparisonText = findSimilarWorkout(currentRun, history, maxHR);
  
  // Generate history table
  const historyTable = generateHistoryTable(history, maxHR);

  const location = currentRun.trainer ? "Treadmill" : "Outdoor";

  return `
SESSION: "${currentRun.name}"
Date: ${date} | Location: ${location}
Intensity: ${zoneClassification.classification} (Zone-based)${zoneClassification.breakdown ? ` [${zoneClassification.breakdown}]` : ''}
Structure: ${runType.type}${runType.detected ? ' (Auto-detected)' : ''}

ACTIVITY METRICS:
• Distance: ${distanceKm} km
• Duration: ${duration}
• Pace: ${avgPace}/km${gapPace ? ` | GAP (Grade Adjusted): ${gapPace}/km` : ''}
• Heart Rate: ${hrInfo}
• Cadence: ${cadenceInfo}
• Elevation: +${Math.round(currentRun.total_elevation_gain)}m
• Shoes/Gear: ${gearInfo}
• RPE: ${rpe}/10 (${rpeLabel}) - User Input
${decoupling ? `• Aerobic Decoupling: ${decoupling.percentage.toFixed(1)}% (${decoupling.status})` : ''}
${currentRun.suffer_score ? `• Suffer Score: ${currentRun.suffer_score}` : ''}

HR ZONES (Time Distribution):
${zonesText}
BEST EFFORTS:
${prsText}
${structureText}${hrDriftText}${comparisonText}
WEEKLY VOLUME TREND:
${weeklyTable}

CONSISTENCY (Last 4 weeks):
${consistencyText}
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
  const sessionData = generateSessionData(currentRun, history, zones, bestEfforts, rpe, profile.maxHR || 0);

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

• Max Heart Rate: ${profile.maxHR && profile.maxHR > 0 ? `${profile.maxHR} bpm` : 'UNKNOWN - Please estimate based on highest observed HR in my data and age-based formulas'}
• Resting Heart Rate: ${profile.restingHR && profile.restingHR > 0 ? `${profile.restingHR} bpm` : 'UNKNOWN'}
• Lactate Threshold: ${profile.lactateThreshold && profile.lactateThreshold.trim() !== '' && profile.lactateThreshold !== '0' ? profile.lactateThreshold : 'UNKNOWN - Please estimate my Lactate Threshold (HR and Pace) based on my recent best efforts, cardiac drift patterns, and pace/HR relationship'}
• Primary Goal: ${profile.goal || 'Not specified - ask me about my goals'}
• Injury History: ${profile.injuryHistory || 'None specified'}

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
  rpe: number,
  maxHR: number
): string => {
  const sessionData = generateSessionData(currentRun, history, zones, bestEfforts, rpe, maxHR);

  return `
📅 DAILY TRAINING UPDATE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Here is my latest training session. Based on our ongoing coaching thread and my profile history:

${sessionData}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ANALYSIS REQUEST:

1. **Session Classification**: Verify the zone-based intensity label. Was this correctly classified?
2. **Trend Check**: Compare with the HISTORICAL COMPARISON data (if available). Am I improving?
3. **Weekly Load**: Review the WEEKLY VOLUME TREND. Is progression safe (<10% week-over-week)?
4. **Consistency**: Check rest day pattern. Any recovery concerns?
5. **Interval Quality** (if applicable): Check work lap HR drift and rest recovery data
6. **Next Session**: What should I focus on next given my weekly load and consistency?

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
  const [isFirstTimeUser, setIsFirstTimeUser] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedActivityIndex, setSelectedActivityIndex] = useState(0); // Which activity to analyze

  // Filter valid runs first
  const validRuns = useMemo(() => filterValidRuns(activities), [activities]);
  
  // Get selected activity and history (all other activities for context)
  const currentRun = validRuns[selectedActivityIndex] || validRuns[0];
  const history = useMemo(() => {
    // History is all activities except the selected one, maintaining order
    return validRuns.filter((_, index) => index !== selectedActivityIndex);
  }, [validRuns, selectedActivityIndex]);
  
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
    const hasProfile = hasStoredProfile();
    
    if (!hasProfile) {
      // First-time user - show onboarding
      setIsFirstTimeUser(true);
      setIsSettingsOpen(true);
      setUserProfile(DEFAULT_PROFILE);
    } else {
      const storedProfile = loadProfileFromStorage();
      setUserProfile(storedProfile);
    }
    
    setIsLoaded(true);
  }, []);

  // Generate prompts dynamically based on mode and RPE
  const systemPrompt = useMemo(() => {
    if (!currentRun) return "";
    return generateSystemPrompt(currentRun, history, userProfile, heartRateZones, bestEfforts, rpe);
  }, [currentRun, history, userProfile, heartRateZones, bestEfforts, rpe]);

  const updatePrompt = useMemo(() => {
    if (!currentRun) return "";
    return generateUpdatePrompt(currentRun, history, heartRateZones, bestEfforts, rpe, userProfile.maxHR || 0);
  }, [currentRun, history, heartRateZones, bestEfforts, rpe, userProfile.maxHR]);

  // Get the active prompt based on mode
  const activePrompt = promptMode === 'setup' ? systemPrompt : updatePrompt;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(activePrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleProfileSave = (newProfile: UserProfile) => {
    setUserProfile(newProfile);
    setIsFirstTimeUser(false); // User has now completed onboarding
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
              {selectedActivityIndex === 0 ? 'Your Latest Run' : 'Activity History'}
            </h1>
            <p className="text-slate-400">
              {selectedActivityIndex === 0 ? (
                <>
                  AI analysis with {validRuns.length} valid sessions 
                  {activities.length !== validRuns.length && (
                    <span className="text-slate-500"> ({activities.length - validRuns.length} filtered out)</span>
                  )}
                </>
              ) : (
                <>
                  Viewing activity from{' '}
                  <span className="text-indigo-400">
                    {new Date(currentRun.start_date_local).toLocaleDateString('en-US', { 
                      month: 'long', 
                      day: 'numeric' 
                    })}
                  </span>
                  {' '}• <button 
                    onClick={() => setSelectedActivityIndex(0)} 
                    className="text-purple-400 hover:text-purple-300 underline underline-offset-2"
                  >
                    Back to latest
                  </button>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ProTipsDialog />
            <SettingsDialog 
              profile={userProfile} 
              onSave={handleProfileSave}
              isOpen={isSettingsOpen}
              onOpenChange={setIsSettingsOpen}
              isFirstTimeUser={isFirstTimeUser}
            />
          </div>
        </div>

        {/* Activity History Selector */}
        {validRuns.length > 1 && (
          <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg text-white">
                <History className="w-5 h-5 text-indigo-400" />
                Select Activity to Analyze
                <span className="text-sm font-normal text-slate-400 ml-2">
                  ({validRuns.length} available)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="relative">
                {/* Scroll hint gradients */}
                <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-slate-900/80 to-transparent z-10 pointer-events-none" />
                <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-slate-900/80 to-transparent z-10 pointer-events-none" />
                
                {/* Scrollable activity list */}
                <div className="flex gap-3 overflow-x-auto pb-2 px-1 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                  {validRuns.map((activity, index) => {
                    const activityDate = new Date(activity.start_date_local);
                    const isSelected = index === selectedActivityIndex;
                    const distanceKm = (activity.distance / 1000).toFixed(1);
                    const pace = formatPace(activity.average_speed);
                    
                    return (
                      <button
                        key={activity.start_date_local + index}
                        onClick={() => setSelectedActivityIndex(index)}
                        className={`flex-shrink-0 p-3 rounded-lg border transition-all duration-200 text-left min-w-[160px] ${
                          isSelected
                            ? 'bg-indigo-600/30 border-indigo-500 shadow-lg shadow-indigo-500/20'
                            : 'bg-slate-800/50 border-slate-700/50 hover:bg-slate-800 hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          {index === 0 && (
                            <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded font-medium">
                              LATEST
                            </span>
                          )}
                          {activity.trainer && (
                            <span className="text-[10px]">🏠</span>
                          )}
                        </div>
                        <p className={`font-medium text-sm truncate ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                          {activity.name}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          {activityDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </p>
                        <div className="flex items-center gap-2 mt-2 text-xs">
                          <span className={isSelected ? 'text-indigo-300' : 'text-slate-400'}>
                            {distanceKm} km
                          </span>
                          <span className="text-slate-600">•</span>
                          <span className={isSelected ? 'text-indigo-300' : 'text-slate-400'}>
                            {pace}/km
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              
              {/* Navigation hint */}
              {selectedActivityIndex > 0 && (
                <p className="text-xs text-amber-400/70 mt-3 flex items-center gap-1">
                  <Info className="w-3 h-3" />
                  Viewing older activity. Swipe/scroll to see more or select the latest.
                </p>
              )}
            </CardContent>
          </Card>
        )}

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
              <div className="font-semibold text-lg text-white">{formattedDate}</div>
            </div>
            <div className="space-y-1 bg-slate-800/50 p-4 rounded-lg border border-slate-700/50">
              <div className="flex items-center gap-2 text-slate-400 text-sm"><MapPin className="w-4 h-4" /> Distance</div>
              <div className="font-semibold text-lg text-white">{(currentRun.distance / 1000).toFixed(2)} km</div>
            </div>
            <div className="space-y-1 bg-slate-800/50 p-4 rounded-lg border border-slate-700/50">
              <div className="flex items-center gap-2 text-slate-400 text-sm"><Timer className="w-4 h-4" /> Pace</div>
              <div className="font-semibold text-lg text-white">{formattedPace}</div>
            </div>
            <div className="space-y-1 bg-slate-800/50 p-4 rounded-lg border border-slate-700/50">
              <div className="flex items-center gap-2 text-slate-400 text-sm"><Clock className="w-4 h-4" /> Duration</div>
              <div className="font-semibold text-lg text-white">{formattedTime}</div>
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
