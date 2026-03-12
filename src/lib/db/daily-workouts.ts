import { getSupabaseAdmin } from "@/lib/supabase";
import { DailyWorkout, WeeklyPlanDay } from "@/types/runwise";

function mapRow(row: Record<string, unknown>): DailyWorkout {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    date: row.date as string,
    workout: row.workout_json as WeeklyPlanDay,
    moodInput: row.mood_input as DailyWorkout["moodInput"],
    moodAdjusted: row.mood_adjusted_json as WeeklyPlanDay | undefined,
    stravaActivityId: row.strava_activity_id as number | undefined,
    feedbackEffort: row.feedback_effort as DailyWorkout["feedbackEffort"],
    feedbackNote: row.feedback_note as string | undefined,
    createdAt: row.created_at as string,
    invalidatedAt: row.invalidated_at as string | undefined,
  };
}

export async function getTodaysWorkout(
  userId: string
): Promise<DailyWorkout | null> {
  const today = new Date().toISOString().split("T")[0];

  const { data } = await getSupabaseAdmin()
    .from("daily_workouts")
    .select("*")
    .eq("user_id", userId)
    .eq("date", today)
    .is("invalidated_at", null)
    .single();

  return data ? mapRow(data) : null;
}

export async function saveDailyWorkout(
  userId: string,
  date: string,
  workout: WeeklyPlanDay
): Promise<DailyWorkout> {
  const { data, error } = await getSupabaseAdmin()
    .from("daily_workouts")
    .upsert(
      {
        user_id: userId,
        date,
        workout_json: workout,
      },
      { onConflict: "user_id,date" }
    )
    .select("*")
    .single();

  if (error) throw new Error(`Failed to save daily workout: ${error.message}`);
  return mapRow(data!);
}

export async function updateMoodAndAdjustment(
  userId: string,
  workoutId: string,
  mood: DailyWorkout["moodInput"],
  adjustedWorkout: WeeklyPlanDay
): Promise<DailyWorkout> {
  const { data, error } = await getSupabaseAdmin()
    .from("daily_workouts")
    .update({
      mood_input: mood,
      mood_adjusted_json: adjustedWorkout,
    })
    .eq("user_id", userId)
    .eq("id", workoutId)
    .select("*")
    .single();

  if (error) throw new Error(`Failed to update mood: ${error.message}`);
  return mapRow(data!);
}

export async function savePostWorkoutFeedback(
  userId: string,
  workoutId: string,
  effort: DailyWorkout["feedbackEffort"],
  note?: string
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("daily_workouts")
    .update({
      feedback_effort: effort,
      feedback_note: note || null,
    })
    .eq("user_id", userId)
    .eq("id", workoutId);

  if (error) throw new Error(`Failed to save feedback: ${error.message}`);
}

export async function linkStravaActivity(
  workoutId: string,
  activityId: number
): Promise<void> {
  const { error } = await getSupabaseAdmin()
    .from("daily_workouts")
    .update({ strava_activity_id: activityId })
    .eq("id", workoutId);

  if (error) throw new Error(`Failed to link activity: ${error.message}`);
}

export async function getWeekWorkouts(
  userId: string,
  weekStart: string
): Promise<DailyWorkout[]> {
  // Calculate week end (Sunday)
  const start = new Date(weekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const weekEnd = end.toISOString().split("T")[0];

  const { data } = await getSupabaseAdmin()
    .from("daily_workouts")
    .select("*")
    .eq("user_id", userId)
    .gte("date", weekStart)
    .lte("date", weekEnd)
    .is("invalidated_at", null)
    .order("date", { ascending: true });

  return (data || []).map(mapRow);
}
