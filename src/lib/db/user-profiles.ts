import { getSupabaseAdmin } from "@/lib/supabase";
import { RunwiseUserProfile, HRZone } from "@/types/runwise";

function mapRow(row: Record<string, unknown>): RunwiseUserProfile {
  return {
    id: row.id as string,
    stravaId: row.strava_id as number,
    stravaAthleteJson: row.strava_athlete_json as Record<string, unknown> | undefined,
    maxHR: row.max_hr as number,
    restingHR: row.resting_hr as number,
    lactateThreshold: (row.lactate_threshold as string) || "",
    goal: (row.goal as string) || "",
    nextRaceDate: row.next_race_date as string | null,
    nextRaceDistance: row.next_race_distance as string | null,
    trainingDaysPerWeek: row.training_days_per_week as number,
    treadmillPreference: (row.treadmill_preference as "yes" | "no" | "sometimes") || "no",
    injuryHistory: (row.injury_history as string) || "",
    aiPersonality: (row.ai_personality as string) || "Supportive Coach",
    onboardingCompleted: row.onboarding_completed as boolean,
    customHrZones: (row.custom_hr_zones as HRZone[] | null) ?? null,
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export async function getOrCreateProfile(
  stravaId: number,
  athleteJson?: Record<string, unknown>
): Promise<RunwiseUserProfile> {
  // Try to find existing
  const { data: existing } = await getSupabaseAdmin()
    .from("user_profiles")
    .select("*")
    .eq("strava_id", stravaId)
    .single();

  if (existing) return mapRow(existing);

  // Create new
  const { data: created, error } = await getSupabaseAdmin()
    .from("user_profiles")
    .insert({
      strava_id: stravaId,
      strava_athlete_json: athleteJson || null,
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to create profile: ${error.message}`);
  return mapRow(created!);
}

export async function updateProfile(
  stravaId: number,
  updates: Partial<{
    maxHR: number;
    restingHR: number;
    lactateThreshold: string;
    goal: string;
    nextRaceDate: string | null;
    nextRaceDistance: string | null;
    trainingDaysPerWeek: number;
    treadmillPreference: string;
    injuryHistory: string;
    aiPersonality: string;
    onboardingCompleted: boolean;
    stravaAthleteJson: Record<string, unknown>;
    customHrZones: HRZone[] | null;
  }>
): Promise<RunwiseUserProfile> {
  const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (updates.maxHR !== undefined) dbUpdates.max_hr = updates.maxHR;
  if (updates.restingHR !== undefined) dbUpdates.resting_hr = updates.restingHR;
  if (updates.lactateThreshold !== undefined) dbUpdates.lactate_threshold = updates.lactateThreshold;
  if (updates.goal !== undefined) dbUpdates.goal = updates.goal;
  if (updates.nextRaceDate !== undefined) dbUpdates.next_race_date = updates.nextRaceDate;
  if (updates.nextRaceDistance !== undefined) dbUpdates.next_race_distance = updates.nextRaceDistance;
  if (updates.trainingDaysPerWeek !== undefined) dbUpdates.training_days_per_week = updates.trainingDaysPerWeek;
  if (updates.treadmillPreference !== undefined) dbUpdates.treadmill_preference = updates.treadmillPreference;
  if (updates.injuryHistory !== undefined) dbUpdates.injury_history = updates.injuryHistory;
  if (updates.aiPersonality !== undefined) dbUpdates.ai_personality = updates.aiPersonality;
  if (updates.onboardingCompleted !== undefined) dbUpdates.onboarding_completed = updates.onboardingCompleted;
  if (updates.stravaAthleteJson !== undefined) dbUpdates.strava_athlete_json = updates.stravaAthleteJson;
  if (updates.customHrZones !== undefined) dbUpdates.custom_hr_zones = updates.customHrZones;

  const { data, error } = await getSupabaseAdmin()
    .from("user_profiles")
    .update(dbUpdates)
    .eq("strava_id", stravaId)
    .select("*")
    .single();

  if (error) throw new Error(`Failed to update profile: ${error.message}`);
  return mapRow(data!);
}

export async function getProfileByStravaId(
  stravaId: number
): Promise<RunwiseUserProfile | null> {
  const { data } = await getSupabaseAdmin()
    .from("user_profiles")
    .select("*")
    .eq("strava_id", stravaId)
    .single();

  return data ? mapRow(data) : null;
}

export async function isOnboardingComplete(stravaId: number): Promise<boolean> {
  const { data } = await getSupabaseAdmin()
    .from("user_profiles")
    .select("onboarding_completed")
    .eq("strava_id", stravaId)
    .single();

  return data?.onboarding_completed === true;
}
