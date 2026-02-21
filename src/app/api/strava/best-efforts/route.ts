import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { NextResponse } from "next/server";

// GET /api/strava/best-efforts?ids=123,456,789
// Fetches best_efforts for multiple Strava activities in parallel
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session || !session.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get("ids");

  if (!idsParam) {
    return NextResponse.json({ error: "Missing ids parameter" }, { status: 400 });
  }

  const ids = idsParam.split(",").map(id => id.trim()).filter(id => id.length > 0);

  if (ids.length === 0) {
    return NextResponse.json({});
  }

  // Limit to 30 activities max to prevent abuse
  const limitedIds = ids.slice(0, 30);
  const accessToken = session.accessToken;

  try {
    // Fetch in batches of 5 to avoid overwhelming Strava API
    const BATCH_SIZE = 5;
    const results: Record<string, any[]> = {};

    for (let i = 0; i < limitedIds.length; i += BATCH_SIZE) {
      const batch = limitedIds.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map(async (id) => {
          try {
            const res = await fetch(
              `https://www.strava.com/api/v3/activities/${id}?include_all_efforts=true`,
              {
                headers: { Authorization: `Bearer ${accessToken}` },
                cache: "no-store",
              }
            );

            if (!res.ok) {
              console.error(`[Best Efforts] Failed to fetch activity ${id}:`, res.status);
              return { id, bestEfforts: [] };
            }

            const data = await res.json();
            return { id, bestEfforts: data.best_efforts || [] };
          } catch (error) {
            console.error(`[Best Efforts] Error fetching activity ${id}:`, error);
            return { id, bestEfforts: [] };
          }
        })
      );

      batchResults.forEach(({ id, bestEfforts }) => {
        results[id] = bestEfforts;
      });
    }

    return NextResponse.json(results);
  } catch (error) {
    console.error("[Best Efforts] Error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
