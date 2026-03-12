import { redirect } from "next/navigation";
import { isOnboardingComplete, getProfileByStravaId } from "@/lib/db/user-profiles";
import { getCurrentWeekPlan } from "@/lib/db/weekly-plans";
import { getTodaysWorkout } from "@/lib/db/daily-workouts";
import { getLatestWorkoutReview } from "@/lib/db/workout-reviews";
import { TodayClient } from "./today-client";
import { requireRunwiseSession } from "@/lib/server/auth";
import { getAthleteActivities } from "@/lib/server/strava";

export default async function TodayPage() {
  let session;
  try {
    session = await requireRunwiseSession({ requireAccessToken: true });
  } catch {
    redirect("/");
  }

  const completed = await isOnboardingComplete(session.stravaId);
  if (!completed) {
    redirect("/onboarding");
  }

  // Fetch data for the page
  const profile = await getProfileByStravaId(session.stravaId);
  const weekPlan = profile ? await getCurrentWeekPlan(profile.id) : null;
  const todaysWorkout = profile ? await getTodaysWorkout(profile.id) : null;
  // Fetch recent Strava activities to mark completed days
  const activities = await getAthleteActivities(session.accessToken!, {
    perPage: 50,
    revalidate: 300,
  }).catch(() => []);
  const completedDates = activities
    .filter(
      (a) =>
        a.type?.toLowerCase().includes("run") ||
        a.sport_type?.toLowerCase().includes("run") ||
        !a.type
    )
    .map((a) => a.start_date_local.split("T")[0]);

  // Get athlete's first name from Strava profile
  const athleteJson = profile?.stravaAthleteJson as Record<string, unknown> | undefined;
  const athleteFirstName = (athleteJson?.firstname as string) || null;

  // Fetch cached review only — generation happens client-side via /api/ai/last-workout-review
  const lastWorkoutReview = profile ? await getLatestWorkoutReview(profile.id) : null;

  return (
    <TodayClient
      weekPlan={weekPlan}
      todaysWorkout={todaysWorkout}
      showTreadmillVariant={profile?.treadmillPreference === "sometimes"}
      completedDates={completedDates}
      profile={profile}
      athleteFirstName={athleteFirstName}
      lastWorkoutReview={lastWorkoutReview}
    />
  );
}
