import { generateJSON, generateText } from "./gemini";
import { buildWeeklyPlanPrompt, buildDailyAdjustmentPrompt, buildPostWorkoutFeedbackPrompt } from "./prompts";
import { getProfileByStravaId } from "@/lib/db/user-profiles";
import { getCurrentWeekPlan, saveWeeklyPlan, getLatestWeeklyPlan } from "@/lib/db/weekly-plans";
import { getTodaysWorkout, saveDailyWorkout, updateMoodAndAdjustment } from "@/lib/db/daily-workouts";
import { WeeklyPlan, WeeklyPlanDay, DailyWorkout } from "@/types/runwise";
import {
  filterValidRuns,
  estimateVDOTFromTempo,
  getDanielsTrainingPaces,
  calculateACWR,
  calculateWeeklyVolumes,
  calculateConsistencyMetrics,
} from "@/lib/metrics";
import { StravaActivity } from "@/types/strava";
import { formatPace, formatDuration } from "@/lib/prompt-generator";

// Fetch recent activities from Strava
async function fetchRecentActivities(
  accessToken: string,
  count: number = 30
): Promise<StravaActivity[]> {
  const response = await fetch(
    `https://www.strava.com/api/v3/athlete/activities?per_page=${count}`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    throw new Error(`Strava API error: ${response.status}`);
  }

  const activities: StravaActivity[] = await response.json();
  return filterValidRuns(activities);
}

// Get the week dates (Monday to Sunday) for a given date
function getWeekDates(date: Date = new Date()): string[] {
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d.toISOString().split("T")[0]);
  }
  return dates;
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

  // Fetch training data
  const activities = await fetchRecentActivities(accessToken, 30);

  // Calculate metrics
  const vdot = estimateVDOTFromTempo(activities, profile.maxHR, profile.restingHR);
  const danielsPaces = getDanielsTrainingPaces(vdot);
  const acwr = calculateACWR(activities);
  const weeklyVolumes = calculateWeeklyVolumes(activities);
  const consistencyMetrics = calculateConsistencyMetrics(activities);

  // Get last week's plan for progression context
  const lastWeekPlan = await getLatestWeeklyPlan(profile.id);

  // Get this week's dates
  const daysOfWeek = getWeekDates();
  const weekStartDate = daysOfWeek[0];

  // Build prompt and call AI
  const prompt = buildWeeklyPlanPrompt({
    profile,
    vdot,
    danielsPaces,
    acwr,
    weeklyVolumes,
    consistencyMetrics,
    lastWeekPlan: lastWeekPlan || undefined,
    weekStartDate,
    daysOfWeek,
  });

  const aiResult = await generateJSON<{
    days: WeeklyPlanDay[];
    totalVolumeKm: number;
    hardDayCount: number;
    rationale: string;
  }>(prompt);

  // Validate and save
  if (!aiResult.days || aiResult.days.length !== 7) {
    throw new Error("AI returned invalid plan structure");
  }

  const plan = await saveWeeklyPlan(profile.id, weekStartDate, {
    days: aiResult.days,
    totalVolumeKm: aiResult.totalVolumeKm,
    hardDayCount: aiResult.hardDayCount,
    rationale: aiResult.rationale,
  });

  // Save each day's workout
  for (const day of aiResult.days) {
    await saveDailyWorkout(profile.id, day.date, day);
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

  // Fetch recent activities for context
  const activities = await fetchRecentActivities(accessToken, 10);
  const vdot = estimateVDOTFromTempo(activities, profile.maxHR, profile.restingHR);
  const acwr = calculateACWR(activities);

  // Build recent summary
  const recentSummary = activities.slice(0, 5).map(a => {
    const dist = (a.distance / 1000).toFixed(1);
    const pace = formatPace(a.average_speed);
    const date = new Date(a.start_date_local).toLocaleDateString("no-NO", { weekday: "short", day: "numeric", month: "short" });
    return `${date}: ${dist}km @ ${pace}/km${a.average_heartrate ? ` (HR: ${Math.round(a.average_heartrate)})` : ""}`;
  }).join("\n");

  const prompt = buildDailyAdjustmentPrompt({
    profile,
    plannedWorkout: todaysWorkout.workout,
    mood,
    recentSummary,
    acwr,
    vdot,
  });

  const aiResult = await generateJSON<{
    adjusted: WeeklyPlanDay;
    explanation: string;
    changed: boolean;
  }>(prompt);

  // Save the adjustment
  await updateMoodAndAdjustment(todaysWorkout.id, mood, aiResult.adjusted);

  return aiResult;
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

  const feedback = await generateText(prompt);
  return feedback.trim().replace(/^["']|["']$/g, "");
}
