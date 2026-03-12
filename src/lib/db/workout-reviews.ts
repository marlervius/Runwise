import { getSupabaseAdmin } from "@/lib/supabase";
import { WorkoutReview } from "@/types/runwise";

function mapRow(row: Record<string, unknown>): WorkoutReview {
  const avp = row.actual_vs_planned as Record<string, unknown> | null;
  return {
    id: row.id as string,
    userId: row.user_id as string,
    stravaActivityId: row.strava_activity_id as number,
    rating: row.rating as WorkoutReview["rating"],
    headline: row.headline as string,
    body: row.body as string,
    keyObservation: (row.key_observation as string) || undefined,
    nextImplication: (row.next_implication as string) || undefined,
    actualVsPlanned: avp
      ? {
          distanceDiffKm: (avp.distance_diff_km as number) ?? 0,
          paceDiffSec: (avp.pace_diff_sec as number) ?? 0,
          withinPlan: (avp.within_plan as boolean) ?? true,
        }
      : undefined,
    createdAt: row.created_at as string,
  };
}

/** Get the latest cached review for a user */
export async function getLatestWorkoutReview(
  userId: string
): Promise<WorkoutReview | null> {
  const { data } = await getSupabaseAdmin()
    .from("workout_reviews")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return data ? mapRow(data) : null;
}

/** Get cached review for a specific Strava activity */
export async function getWorkoutReviewByActivity(
  userId: string,
  stravaActivityId: number
): Promise<WorkoutReview | null> {
  const { data } = await getSupabaseAdmin()
    .from("workout_reviews")
    .select("*")
    .eq("user_id", userId)
    .eq("strava_activity_id", stravaActivityId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  return data ? mapRow(data) : null;
}

/** Save (upsert) a workout review */
export async function saveWorkoutReview(
  userId: string,
  review: Omit<WorkoutReview, "id" | "userId" | "createdAt">
): Promise<WorkoutReview> {
  const { data, error } = await getSupabaseAdmin()
    .from("workout_reviews")
    .insert({
      user_id: userId,
      strava_activity_id: review.stravaActivityId,
      rating: review.rating,
      headline: review.headline,
      body: review.body,
      key_observation: review.keyObservation ?? null,
      next_implication: review.nextImplication ?? null,
      actual_vs_planned: review.actualVsPlanned
        ? {
            distance_diff_km: review.actualVsPlanned.distanceDiffKm,
            pace_diff_sec: review.actualVsPlanned.paceDiffSec,
            within_plan: review.actualVsPlanned.withinPlan,
          }
        : null,
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to save workout review: ${error.message}`);
  return mapRow(data!);
}
