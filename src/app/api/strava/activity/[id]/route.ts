import { NextResponse } from "next/server";
import { getDetailedActivity, getHeartRateZoneBuckets } from "@/lib/server/strava";
import { handleRouteError } from "@/lib/server/api";
import { requireRunwiseSession } from "@/lib/server/auth";
import { parsePositiveIntegerString } from "@/lib/server/validation";

// GET /api/strava/activity/[id]
// Fetches detailed activity data + HR zones for a specific Strava activity
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireRunwiseSession({ requireAccessToken: true });
    const { id } = await params;
    const activityId = parsePositiveIntegerString(id, "id");

    console.log(`[Strava API] Fetching detailed activity ${id}...`);

    const [detailed, heartRateZones] = await Promise.all([
      getDetailedActivity(session.accessToken!, activityId),
      getHeartRateZoneBuckets(session.accessToken!, activityId),
    ]);

    const bestEfforts = detailed?.best_efforts || [];

    return NextResponse.json({
      detailed,
      heartRateZones,
      bestEfforts,
    });
  } catch (error) {
    return handleRouteError(error, "[Strava API] Error fetching activity");
  }
}
