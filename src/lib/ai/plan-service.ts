import { generateJSON, generateText, GeminiQuotaError } from "./gemini";
import { buildWeeklyPlanPrompt, buildDailyAdjustmentPrompt, buildPostWorkoutFeedbackPrompt } from "./prompts";
import { getProfileByStravaId } from "@/lib/db/user-profiles";
import { getCurrentWeekPlan, saveWeeklyPlan, getLatestWeeklyPlan } from "@/lib/db/weekly-plans";
import { getTodaysWorkout, saveDailyWorkout, updateMoodAndAdjustment } from "@/lib/db/daily-workouts";
import { buildRecentActivitySummary, buildTrainingContext } from "./training-context";
import { WeeklyPlan, WeeklyPlanDay, RunwiseUserProfile } from "@/types/runwise";
import {
  DanielsTrainingPaces,
  MissedTrainingAnalysis,
  ACWRMetrics,
  getDanielsTrainingPaces,
} from "@/lib/metrics";
import { StravaActivity } from "@/types/strava";
import { formatPace, formatDuration } from "@/lib/prompt-generator";

// Get 14 dates starting from today
function getPlanDates(startDate: Date = new Date()): string[] {
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);

  const dates: string[] = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
}

// Build HR zone strings from pre-calculated zones array (Z1–Z5)
function getHRZoneStrings(
  zones: { zone: string; min: number; max: number }[]
): Record<string, string> {
  if (!zones || zones.length < 5) {
    return { easy: "", threshold: "", interval: "", long: "", rest: "-", recovery: "" };
  }
  // zones[0]=Z1 Recovery, zones[1]=Z2 Easy, zones[2]=Z3 Tempo, zones[3]=Z4 Threshold, zones[4]=Z5 VO2max
  return {
    easy: `${zones[1].min}-${zones[1].max} bpm`,
    recovery: `${zones[0].min}-${zones[0].max} bpm`,
    threshold: `${zones[3].min}-${zones[3].max} bpm`,
    interval: `${zones[4].min}-${zones[4].max} bpm`,
    long: `${zones[1].min}-${zones[1].max} bpm`,
    rest: "-",
  };
}

// Build a fallback plan locally when Gemini is unavailable
function buildFallbackPlan(
  profile: RunwiseUserProfile,
  daysOfWeek: string[],
  danielsPaces: DanielsTrainingPaces | null,
  weeklyVolumes: { km: number }[],
  hrZones: { zone: string; min: number; max: number }[] = [],
  missedTraining?: MissedTrainingAnalysis
): {
  days: WeeklyPlanDay[];
  totalVolumeKm: number;
  hardDayCount: number;
  rationale: string;
} {
  const trainingDays = profile.trainingDaysPerWeek || 4;

  // Apply missed-training volume factor if applicable
  const volumeFactor = missedTraining?.volumeFactor ?? 1.0;
  const easyOnlyDays = missedTraining?.easyOnlyDays ?? 0;

  // Estimate base volume from recent history or default, then apply factor
  const rawAvgKm =
    weeklyVolumes.length > 0
      ? weeklyVolumes.reduce((sum, w) => sum + w.km, 0) / weeklyVolumes.length
      : trainingDays * 7;
  const recentAvgKm = rawAvgKm * volumeFactor;

  // Weekly template patterns by training days (80/20 rule)
  // dayOfWeek: 0=Mon, 1=Tue, ..., 6=Sun
  const weeklyTemplates: Record<number, { type: WeeklyPlanDay["workoutType"]; pct: number; dow: number }[]> = {
    3: [
      { type: "easy", pct: 0.30, dow: 1 },
      { type: "threshold", pct: 0.25, dow: 3 },
      { type: "long", pct: 0.45, dow: 5 },
    ],
    4: [
      { type: "easy", pct: 0.22, dow: 0 },
      { type: "threshold", pct: 0.22, dow: 2 },
      { type: "easy", pct: 0.20, dow: 4 },
      { type: "long", pct: 0.36, dow: 5 },
    ],
    5: [
      { type: "easy", pct: 0.18, dow: 0 },
      { type: "interval", pct: 0.16, dow: 1 },
      { type: "easy", pct: 0.16, dow: 3 },
      { type: "threshold", pct: 0.18, dow: 4 },
      { type: "long", pct: 0.32, dow: 5 },
    ],
    6: [
      { type: "easy", pct: 0.15, dow: 0 },
      { type: "interval", pct: 0.14, dow: 1 },
      { type: "easy", pct: 0.14, dow: 2 },
      { type: "threshold", pct: 0.15, dow: 3 },
      { type: "easy", pct: 0.14, dow: 4 },
      { type: "long", pct: 0.28, dow: 5 },
    ],
  };

  const template = weeklyTemplates[Math.min(Math.max(trainingDays, 3), 6)];
  // Build a set of which days-of-week are training days
  const trainingDOWs = new Set(template.map((t) => t.dow));

  const typeNorwegian: Record<string, string> = {
    easy: "Rolig tur",
    threshold: "Terskeløkt",
    interval: "Intervalløkt",
    long: "Langtur",
    rest: "Hviledag",
    recovery: "Restitusjon",
  };

  const descriptions: Record<string, string> = {
    easy: "Rolig og behagelig løpetur. Hold pulsen lav og nyt turen.",
    threshold: "Terskeltrening for å bygge fart. Hold jevn, kontrollert intensitet.",
    interval: "Intervaller for å øke VO2max. Kjør hardt med god pause mellom dragene.",
    long: "Langtur for å bygge utholdenhet. Hold rolig og jevn pace hele veien.",
    rest: "Hviledag. La kroppen restituere seg for neste økt.",
    recovery: "Lett restitusjonsjog. Veldig rolig for å fremme blodsirkulasjon.",
  };

  const zoneMap: Record<string, string> = {
    easy: "Z1-Z2",
    threshold: "Z3-Z4",
    interval: "Z4-Z5",
    long: "Z1-Z2",
    rest: "-",
    recovery: "Z1",
  };

  const paceMap: Record<string, string> = {
    easy: danielsPaces?.easy ? `${danielsPaces.easy}/km` : "5:30-6:30/km",
    threshold: danielsPaces?.threshold ? `${danielsPaces.threshold}/km` : "4:30-5:00/km",
    interval: danielsPaces?.interval ? `${danielsPaces.interval}/km` : "4:00-4:30/km",
    long: danielsPaces?.easy ? `${danielsPaces.easy}/km` : "5:40-6:30/km",
    rest: "-",
    recovery: danielsPaces?.easy ? `${danielsPaces.easy}/km` : "6:00-7:00/km",
  };

  // Build HR zone strings from the provided zones (Strava or calculated)
  const hrZoneStrings = getHRZoneStrings(hrZones);

  let totalKm = 0;
  let hardDays = 0;

  const days: WeeklyPlanDay[] = daysOfWeek.map((date) => {
    // Get day-of-week: 0=Mon, 1=Tue, ..., 6=Sun
    const jsDay = new Date(date).getDay(); // 0=Sun, 1=Mon, ...
    const dow = jsDay === 0 ? 6 : jsDay - 1; // convert to 0=Mon, 6=Sun
    const dayOfWeek = dow + 1; // 1=Mon, 7=Sun

    const entry = template.find((t) => t.dow === dow);

    if (!entry || !trainingDOWs.has(dow)) {
      return {
        dayOfWeek,
        date,
        workoutType: "rest" as const,
        workoutTypeNorwegian: "Hviledag",
        durationMinutes: 0,
        estimatedDistanceKm: 0,
        intensityZone: "-",
        paceZone: "-",
        description: descriptions.rest,
        isHardDay: false,
      };
    }

    const km = Math.round(recentAvgKm * entry.pct * 10) / 10;

    // Apply easyOnly restriction: force hard days to easy during return from injury/rest
    const sortedDates = [...daysOfWeek].sort();
    const easyUntilDate = easyOnlyDays > 0
      ? sortedDates[Math.min(easyOnlyDays - 1, sortedDates.length - 1)]
      : null;
    const forceEasy = easyUntilDate !== null && date <= easyUntilDate
      && (entry.type === "threshold" || entry.type === "interval");

    const effectiveType = forceEasy ? ("easy" as const) : entry.type;
    const avgPaceMin = effectiveType === "easy" || effectiveType === "long" ? 5.8
      : effectiveType === "threshold" ? 5.0 : 4.5;
    const duration = Math.round(km * avgPaceMin);
    const isHard = !forceEasy && (entry.type === "threshold" || entry.type === "interval");

    totalKm += km;
    if (isHard) hardDays++;

    return {
      dayOfWeek,
      date,
      workoutType: effectiveType,
      workoutTypeNorwegian: typeNorwegian[effectiveType],
      durationMinutes: duration,
      estimatedDistanceKm: km,
      intensityZone: zoneMap[effectiveType],
      hrZone: hrZoneStrings[effectiveType] || undefined,
      paceZone: paceMap[effectiveType],
      description: forceEasy
        ? `Rolig returfase etter ${missedTraining?.consecutiveRestDays ?? 0} dager uten løping. Bygg forsiktig opp igjen.`
        : descriptions[effectiveType],
      isHardDay: isHard,
    };
  });

  const missedRationale = missedTraining && missedTraining.level !== "none"
    ? ` Tilpasset etter ${missedTraining.consecutiveRestDays} dagers fravær (${missedTraining.level}-protokoll).`
    : "";

  return {
    days,
    totalVolumeKm: Math.round(totalKm * 10) / 10,
    hardDayCount: hardDays,
    rationale: `Automatisk generert plan basert på dine treningsdata. ${trainingDays} økter denne uken med ${hardDays} harde dager. Planen følger 80/20-regelen.${missedRationale}`,
  };
}

function hasValidPlanDays(days: WeeklyPlanDay[], expectedDates: string[]): boolean {
  return (
    Array.isArray(days) &&
    days.length === expectedDates.length &&
    expectedDates.every((date, index) => days[index]?.date === date)
  );
}

export async function generateWeeklyPlan(
  stravaId: number,
  accessToken: string
): Promise<WeeklyPlan> {
  const profile = await getProfileByStravaId(stravaId);
  if (!profile) throw new Error("Profile not found");

  // Check if plan already exists for this week
  const existingPlan = await getCurrentWeekPlan(profile.id);
  if (existingPlan) return existingPlan;

  const {
    maxHR,
    effectiveVdot,
    effectiveDanielsPaces,
    acwr,
    weeklyVolumes,
    consistencyMetrics,
    hrZones,
    hrZonesSource,
    missedTraining,
    spikeRisk,
    periodization,
  } = await buildTrainingContext(profile, accessToken, 30);

  console.log(`[PlanService] HR zones source: ${hrZonesSource}, maxHR=${maxHR}, Z2=${hrZones[1]?.min}-${hrZones[1]?.max}`);

  // Get last plan for progression context
  const lastWeekPlan = await getLatestWeeklyPlan(profile.id);

  // Get 14 dates starting from today
  const planDates = getPlanDates();
  const planStartDate = planDates[0];

  let planData: {
    days: WeeklyPlanDay[];
    totalVolumeKm: number;
    hardDayCount: number;
    rationale: string;
    weekFocus?: string;
    internal_reasoning?: string;
  };

  try {
    // Build prompt and call AI — pass real maxHR so prompt shows correct values
    const profileWithHR = { ...profile, maxHR };
    const recentAvgKm = weeklyVolumes.length > 0
      ? weeklyVolumes.reduce((s, w) => s + w.km, 0) / weeklyVolumes.length
      : 0;

    const prompt = buildWeeklyPlanPrompt({
      profile: profileWithHR,
      vdot: effectiveVdot,
      danielsPaces: effectiveDanielsPaces,
      acwr,
      weeklyVolumes,
      consistencyMetrics,
      lastWeekPlan: lastWeekPlan || undefined,
      weekStartDate: planStartDate,
      daysOfWeek: planDates,
      hrZones,
      periodization,
      missedTraining,
      spikeRisk,
      weeklyVolumeKm: recentAvgKm,
    });

    planData = await generateJSON<{
      days: WeeklyPlanDay[];
      totalVolumeKm: number;
      hardDayCount: number;
      rationale: string;
      weekFocus?: string;
      internal_reasoning?: string;
    }>(prompt);

    // AI output must match the full 14-day date window we requested.
    if (!hasValidPlanDays(planData.days, planDates)) {
      console.warn(`[PlanService] AI returned ${planData.days?.length || 0} days, expected 14. Using fallback.`);
      planData = buildFallbackPlan(profile, planDates, effectiveDanielsPaces, weeklyVolumes, hrZones, missedTraining);
    } else {
      // ── BACKEND SAFETY VALIDATION ─────────────────────────────────────
      // 1. ACWR > 1.50: Fjern alle harde økter (interval/threshold) fra planen
      if (acwr && acwr.ratio > 1.50) {
        let warningsTriggered = 0;
        planData.days = planData.days.map(day => {
          if (day.workoutType === "interval" || day.workoutType === "threshold") {
            warningsTriggered++;
            return {
              ...day,
              workoutType: "easy" as const,
              workoutTypeNorwegian: "Rolig tur",
              intensityZone: "Z1-Z2",
              isHardDay: false,
              hrZone: hrZones[1] ? `${hrZones[1].min}-${hrZones[1].max} bpm` : day.hrZone,
              paceZone: effectiveDanielsPaces?.easy ? `${effectiveDanielsPaces.easy}/km` : day.paceZone,
              description: `Nedgradert til rolig tur — ACWR (${acwr.ratio.toFixed(2)}) er i faresonen. Kroppen trenger restitusjon.`,
            };
          }
          return day;
        });
        if (warningsTriggered > 0) {
          console.warn(`[PlanService] ACWR safety: ${warningsTriggered} hard sessions downgraded (ratio=${acwr.ratio.toFixed(2)})`);
          planData.rationale = `⚠️ ${warningsTriggered} harde økt(er) ble automatisk nedgradert til rolig løp fordi ACWR (${acwr.ratio.toFixed(2)}) er i faresonen. ${planData.rationale}`;
        }
      }

      // 2. 10%-regel: Cap enkelt-økt-distanse til safeMaxSingleRun
      if (spikeRisk.safeMaxSingleRun > 0) {
        let spikesCapped = 0;
        planData.days = planData.days.map(day => {
          if (day.estimatedDistanceKm > spikeRisk.safeMaxSingleRun) {
            spikesCapped++;
            const ratio = spikeRisk.safeMaxSingleRun / day.estimatedDistanceKm;
            return {
              ...day,
              estimatedDistanceKm: Math.round(spikeRisk.safeMaxSingleRun * 10) / 10,
              durationMinutes: Math.round(day.durationMinutes * ratio),
              description: `${day.description} (Avkortet til ${spikeRisk.safeMaxSingleRun}km — 10%-regelen for skadeforebygging.)`,
            };
          }
          return day;
        });
        if (spikesCapped > 0) {
          console.warn(`[PlanService] Spike prevention: ${spikesCapped} session(s) capped at ${spikeRisk.safeMaxSingleRun}km`);
        }
      }

      // 3. Tapt trening: Tving rolige dager i starten av planen
      if (missedTraining.easyOnlyDays > 0) {
        let enforcedEasy = 0;
        const sortedDates = [...planDates].sort();
        const easyUntilDate = sortedDates[Math.min(missedTraining.easyOnlyDays - 1, sortedDates.length - 1)];
        planData.days = planData.days.map(day => {
          if (day.date <= easyUntilDate && (day.workoutType === "interval" || day.workoutType === "threshold")) {
            enforcedEasy++;
            return {
              ...day,
              workoutType: "easy" as const,
              workoutTypeNorwegian: "Rolig tur",
              intensityZone: "Z1-Z2",
              isHardDay: false,
              hrZone: hrZones[1] ? `${hrZones[1].min}-${hrZones[1].max} bpm` : day.hrZone,
              paceZone: effectiveDanielsPaces?.easy ? `${effectiveDanielsPaces.easy}/km` : day.paceZone,
              description: `Rolig returfase etter ${missedTraining.consecutiveRestDays} dager uten løping. Bygg forsiktig opp igjen.`,
            };
          }
          return day;
        });
        if (enforcedEasy > 0) {
          console.warn(`[PlanService] Missed training protocol: ${enforcedEasy} session(s) forced to easy (${missedTraining.consecutiveRestDays}d gap)`);
        }
      }

      // Log CoT reasoning for debugging
      if (planData.internal_reasoning) {
        console.info(`[PlanService] AI reasoning: ${planData.internal_reasoning.substring(0, 200)}...`);
      }
    }
  } catch (error) {
    console.warn("[PlanService] AI plan generation failed, using fallback:", error instanceof Error ? error.message : error);
    if (error instanceof GeminiQuotaError) {
      console.warn("[PlanService] Gemini quota exceeded");
    }
    planData = buildFallbackPlan(profile, planDates, effectiveDanielsPaces, weeklyVolumes, hrZones, missedTraining);
  }

  const plan = await saveWeeklyPlan(profile.id, planStartDate, {
    days: planData.days,
    totalVolumeKm: planData.totalVolumeKm,
    hardDayCount: planData.hardDayCount,
    rationale: planData.rationale,
    weekFocus: planData.weekFocus,
  });

  // Save each day's workout (non-blocking — plan still works if this fails)
  try {
    for (const day of planData.days) {
      await saveDailyWorkout(profile.id, day.date, day);
    }
  } catch (err) {
    console.warn("[PlanService] Failed to save daily workouts:", err instanceof Error ? err.message : err);
  }

  return plan;
}

export async function adjustDailyWorkout(
  stravaId: number,
  accessToken: string,
  mood: "tired" | "normal" | "strong"
): Promise<{
  adjusted: WeeklyPlanDay;
  explanation: string;
  changed: boolean;
}> {
  const profile = await getProfileByStravaId(stravaId);
  if (!profile) throw new Error("Profile not found");

  // Get today's planned workout
  const todaysWorkout = await getTodaysWorkout(profile.id);
  if (!todaysWorkout) throw new Error("No workout planned for today");

  const { activities, vdot, acwr, weeklyVolumes, hrZones: hrZonesDaily, missedTraining, periodization } =
    await buildTrainingContext(profile, accessToken, 20);
  const recentSummary = buildRecentActivitySummary(activities, 5);
  const dailyAvgKm = weeklyVolumes.slice(0, 4)
    .reduce((s, w, _, arr) => s + w.km / arr.length, 0);

  const prompt = buildDailyAdjustmentPrompt({
    profile,
    plannedWorkout: todaysWorkout.workout,
    mood,
    recentSummary,
    acwr,
    vdot,
    missedTraining,
    weeklyVolumeKm: dailyAvgKm,
    weeksToRace: periodization.weeksToRace,
  });

  let aiResult: {
    adjusted: WeeklyPlanDay;
    explanation: string;
    changed: boolean;
  };

  try {
    aiResult = await generateJSON<{
      adjusted: WeeklyPlanDay;
      explanation: string;
      changed: boolean;
    }>(prompt);
  } catch (error) {
    if (error instanceof GeminiQuotaError) {
      console.warn("[PlanService] Gemini quota exceeded, using fallback daily adjustment");
      aiResult = buildFallbackAdjustment(todaysWorkout.workout, mood, acwr, missedTraining);
    } else {
      throw error;
    }
  }

  // ── BACKEND SAFETY OVERRIDE for daily adjustment ─────────────────
  // ACWR > 1.50: Tving ned til rolig økt uansett hva AI eller humør sier
  if (acwr && acwr.ratio > 1.50) {
    const original = aiResult.adjusted;
    if (original.workoutType === "interval" || original.workoutType === "threshold") {
      console.warn(`[PlanService] Daily ACWR override: forced easy (ratio=${acwr.ratio.toFixed(2)})`);
      const easyPaces = getDanielsTrainingPaces(vdot);
      aiResult = {
        adjusted: {
          ...original,
          workoutType: "easy",
          workoutTypeNorwegian: "Rolig tur",
          intensityZone: "Z1-Z2",
          isHardDay: false,
          hrZone: hrZonesDaily[1] ? `${hrZonesDaily[1].min}-${hrZonesDaily[1].max} bpm` : original.hrZone,
          paceZone: easyPaces?.easy ? `${easyPaces.easy}/km` : original.paceZone,
          description: `Nedgradert automatisk — ACWR (${acwr.ratio.toFixed(2)}) er i faresonen. Ta det rolig i dag for å unngå skade.`,
        },
        explanation: `⚠️ Treningsbelastningen din er for høy (ACWR ${acwr.ratio.toFixed(2)}). Dagens økt er automatisk endret til rolig løp for å beskytte deg mot skade. Helse går alltid foran prestasjon.`,
        changed: true,
      };
    }
  }

  // Save the adjustment
  await updateMoodAndAdjustment(profile.id, todaysWorkout.id, mood, aiResult.adjusted);

  return aiResult;
}

function buildFallbackAdjustment(
  workout: WeeklyPlanDay,
  mood: "tired" | "normal" | "strong",
  acwr?: ACWRMetrics | null,
  missedTraining?: MissedTrainingAnalysis
): { adjusted: WeeklyPlanDay; explanation: string; changed: boolean } {
  // ACWR faresone: tving alltid ned uansett humør
  if (acwr && acwr.ratio > 1.50 &&
      (workout.workoutType === "interval" || workout.workoutType === "threshold")) {
    const adjusted = {
      ...workout,
      workoutType: "easy" as const,
      workoutTypeNorwegian: "Rolig tur",
      intensityZone: "Z1-Z2",
      isHardDay: false,
      description: `Nedgradert — ACWR (${acwr.ratio.toFixed(2)}) er i faresonen. Kun rolig løping i dag.`,
    };
    return {
      adjusted,
      explanation: `ACWR er ${acwr.ratio.toFixed(2)} — i faresonen. Harde økter er ikke tillatt.`,
      changed: true,
    };
  }

  // Tapt trening: tving rolig i returfase
  if (missedTraining && missedTraining.easyOnlyDays > 0 &&
      (workout.workoutType === "interval" || workout.workoutType === "threshold")) {
    const adjusted = {
      ...workout,
      workoutType: "easy" as const,
      workoutTypeNorwegian: "Rolig tur",
      intensityZone: "Z1-Z2",
      isHardDay: false,
      description: `Rolig returfase etter ${missedTraining.consecutiveRestDays} dager uten løping. Bygg forsiktig opp igjen.`,
    };
    return {
      adjusted,
      explanation: `Du har hatt ${missedTraining.consecutiveRestDays} dager uten løping. Returfasen krever rolig trening.`,
      changed: true,
    };
  }

  if (mood === "normal") {
    return {
      adjusted: workout,
      explanation: "Du føler deg normal — planen beholdes som den er.",
      changed: false,
    };
  }

  const adjusted = { ...workout };

  if (mood === "tired") {
    // Reduce intensity and duration
    if (adjusted.workoutType === "interval" || adjusted.workoutType === "threshold") {
      adjusted.workoutType = "easy";
      adjusted.workoutTypeNorwegian = "Rolig tur";
      adjusted.isHardDay = false;
      adjusted.intensityZone = "Z1-Z2";
    }
    adjusted.durationMinutes = Math.round(adjusted.durationMinutes * 0.75);
    adjusted.estimatedDistanceKm = Math.round(adjusted.estimatedDistanceKm * 0.75 * 10) / 10;
    adjusted.description = "Redusert økt fordi du er sliten. Ta det rolig i dag.";
    return {
      adjusted,
      explanation: "Du er sliten — økten er gjort lettere og kortere for å la kroppen restituere.",
      changed: true,
    };
  }

  // mood === "strong" — slight increase but conservative
  adjusted.durationMinutes = Math.round(adjusted.durationMinutes * 1.1);
  adjusted.estimatedDistanceKm = Math.round(adjusted.estimatedDistanceKm * 1.1 * 10) / 10;
  adjusted.description = workout.description + " Litt ekstra i dag siden du føler deg sterk.";
  return {
    adjusted,
    explanation: "Du føler deg sterk — økten er justert litt opp, men vi holder oss konservative.",
    changed: true,
  };
}

export async function generatePostWorkoutFeedback(
  activity: StravaActivity,
  plannedWorkout: WeeklyPlanDay
): Promise<string> {
  const actualPace = formatPace(activity.average_speed);
  const actualDistance = (activity.distance / 1000).toFixed(1) + " km";
  const actualDuration = formatDuration(activity.moving_time);

  const prompt = buildPostWorkoutFeedbackPrompt({
    plannedWorkout,
    actualPace,
    actualDistance,
    actualDuration,
    actualAvgHR: activity.average_heartrate ? Math.round(activity.average_heartrate) : undefined,
    activityName: activity.name,
  });

  try {
    const feedback = await generateText(prompt);
    return feedback.trim().replace(/^["']|["']$/g, "");
  } catch (error) {
    if (error instanceof GeminiQuotaError) {
      console.warn("[PlanService] Gemini quota exceeded, using fallback feedback");
      const dist = (activity.distance / 1000).toFixed(1);
      return `Bra jobba med ${dist} km i dag! Kroppen blir sterkere for hver økt.`;
    }
    throw error;
  }
}
