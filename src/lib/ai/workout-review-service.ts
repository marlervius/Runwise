import { RunwiseUserProfile, WeeklyPlan, WorkoutReview } from "@/types/runwise";
import { StravaActivity } from "@/types/strava";
import { buildLastWorkoutReviewPrompt } from "@/lib/ai/prompts";
import { generateJSON } from "@/lib/ai/gemini";
import { getWorkoutReviewByActivity, saveWorkoutReview } from "@/lib/db/workout-reviews";

function secondsToPace(secondsPerKm: number): string {
  const mins = Math.floor(secondsPerKm / 60);
  const secs = Math.round(secondsPerKm % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Returns the latest workout review for the user.
 * Checks cache first — only calls Gemini if no cached review exists
 * for the latest Strava activity.
 *
 * Pass `activities` (already fetched for the page) to avoid extra Strava calls.
 */
export async function getOrGenerateWorkoutReview(
  profile: RunwiseUserProfile,
  activities: StravaActivity[],
  weekPlan: WeeklyPlan | null
): Promise<WorkoutReview | null> {
  try {
    // Find latest running activity from the provided list
    const latestRun = activities.find(
      (a) =>
        a.type?.toLowerCase().includes("run") ||
        a.sport_type?.toLowerCase().includes("run")
    );
    if (!latestRun) return null;

    const activityId = Number(latestRun.id);

    // Check cache — return immediately if already generated for this activity
    const cached = await getWorkoutReviewByActivity(profile.id, activityId);
    if (cached) return cached;

    // Build activity metrics
    const distanceKm = (latestRun.distance || 0) / 1000;
    const durationMin = Math.round((latestRun.moving_time || 0) / 60);
    const paceSecPerKm = distanceKm > 0 ? (latestRun.moving_time || 0) / distanceKm : 0;
    const avgPace = paceSecPerKm > 0 ? secondsToPace(paceSecPerKm) : "–";
    const activityDate =
      latestRun.start_date_local?.split("T")[0] ||
      new Date().toISOString().split("T")[0];

    // Find planned workout for that day
    const plannedDay = weekPlan?.days.find((d) => d.date === activityDate) || null;

    const prompt = buildLastWorkoutReviewPrompt({
      activity: {
        name: latestRun.name || "Løpetur",
        type: latestRun.sport_type || latestRun.type || "Run",
        distanceKm,
        durationMin,
        avgPace,
        avgHR: latestRun.average_heartrate || undefined,
        maxHR: latestRun.max_heartrate || undefined,
        date: activityDate,
      },
      plannedWorkout: plannedDay
        ? {
            workoutTypeNorwegian: plannedDay.workoutTypeNorwegian,
            estimatedDistanceKm: plannedDay.estimatedDistanceKm,
            paceZone: plannedDay.paceZone,
            intensityZone: plannedDay.intensityZone,
          }
        : null,
      profile: {
        maxHR: profile.maxHR,
        nextRaceDate: profile.nextRaceDate,
        nextRaceDistance: profile.nextRaceDistance,
      },
    });

    // Call Gemini via shared client (picks up GEMINI_MODEL from env, has retry logic)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = await generateJSON<any>(prompt);

    return await saveWorkoutReview(profile.id, {
      stravaActivityId: activityId,
      rating: parsed.rating || "ok",
      headline: parsed.headline || "",
      body: parsed.body || "",
      keyObservation: parsed.key_observation || undefined,
      nextImplication: parsed.next_implication || undefined,
      actualVsPlanned: parsed.actual_vs_planned
        ? {
            distanceDiffKm: parsed.actual_vs_planned.distance_diff_km ?? 0,
            paceDiffSec: parsed.actual_vs_planned.pace_diff_sec ?? 0,
            withinPlan: parsed.actual_vs_planned.within_plan ?? true,
          }
        : undefined,
    });
  } catch (err) {
    console.error("[WorkoutReview] Error:", err);
    return null;
  }
}
