import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { NextResponse } from "next/server";

// GET /api/strava/activity/[id]
// Fetches detailed activity data + HR zones for a specific Strava activity
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);

  if (!session || !session.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const accessToken = session.accessToken;

  try {
    console.log(`[Strava API] Fetching detailed activity ${id}...`);

    const [detailedRes, zonesRes] = await Promise.all([
      fetch(
        `https://www.strava.com/api/v3/activities/${id}?include_all_efforts=true`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        }
      ),
      fetch(
        `https://www.strava.com/api/v3/activities/${id}/zones`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
          cache: "no-store",
        }
      ),
    ]);

    if (!detailedRes.ok) {
      console.error(`[Strava API] Failed to fetch activity ${id}:`, detailedRes.status);
      return NextResponse.json(
        { error: "Failed to fetch activity from Strava" },
        { status: detailedRes.status }
      );
    }

    const detailed = await detailedRes.json();
    const zones = zonesRes.ok ? await zonesRes.json() : [];

    const heartRateZones =
      zones?.find((z: any) => z.type === "heartrate")?.distribution_buckets || [];
    const bestEfforts = detailed?.best_efforts || [];

    return NextResponse.json({
      detailed,
      heartRateZones,
      bestEfforts,
    });
  } catch (error) {
    console.error(`[Strava API] Error fetching activity ${id}:`, error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
