import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { isOnboardingComplete, getProfileByStravaId } from "@/lib/db/user-profiles";
import { getCurrentWeekPlan } from "@/lib/db/weekly-plans";
import { getTodaysWorkout } from "@/lib/db/daily-workouts";
import { TodayClient } from "./today-client";

export default async function TodayPage() {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken || !session?.stravaId) {
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

  return (
    <TodayClient
      weekPlan={weekPlan}
      todaysWorkout={todaysWorkout}
      showTreadmillVariant={profile?.treadmillPreference === "sometimes"}
    />
  );
}
