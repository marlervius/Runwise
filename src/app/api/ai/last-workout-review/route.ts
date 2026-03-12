import { NextResponse } from "next/server";
import { getProfileByStravaId } from "@/lib/db/user-profiles";
import { getCurrentWeekPlan } from "@/lib/db/weekly-plans";
import { getOrGenerateWorkoutReview } from "@/lib/ai/workout-review-service";
import { handleRouteError, notFound } from "@/lib/server/api";
import { requireRunwiseSession } from "@/lib/server/auth";
import { getAthleteActivities } from "@/lib/server/strava";

export async function GET() {
  try {
    const session = await requireRunwiseSession({ requireAccessToken: true });

    const profile = await getProfileByStravaId(session.stravaId);
    if (!profile) {
      throw notFound("Profile not found");
    }

    const [activities, weekPlan] = await Promise.all([
      getAthleteActivities(session.accessToken!, { perPage: 10, page: 1 }),
      getCurrentWeekPlan(profile.id),
    ]);

    const review = await getOrGenerateWorkoutReview(profile, activities, weekPlan);
    return NextResponse.json({ review });
  } catch (error) {
    return handleRouteError(error, "[LastWorkoutReview] Error");
  }
}
