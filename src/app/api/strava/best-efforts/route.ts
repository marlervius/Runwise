import { NextResponse } from "next/server";
import { badRequest, handleRouteError } from "@/lib/server/api";
import { requireRunwiseSession } from "@/lib/server/auth";
import { getActivityBestEfforts } from "@/lib/server/strava";
import { parsePositiveIntegerString } from "@/lib/server/validation";

// GET /api/strava/best-efforts?ids=123,456,789
// Fetches best_efforts for multiple Strava activities in parallel
export async function GET(request: Request) {
  try {
    const session = await requireRunwiseSession({ requireAccessToken: true });
    const { searchParams } = new URL(request.url);
    const idsParam = searchParams.get("ids");

    if (!idsParam) {
      throw badRequest("Missing ids parameter.");
    }

    const ids = Array.from(
      new Set(
        idsParam
          .split(",")
          .map((id) => id.trim())
          .filter((id) => id.length > 0)
          .map((id) => parsePositiveIntegerString(id, "ids"))
      )
    );

    if (ids.length === 0) {
      throw badRequest("ids must include at least one valid activity id.");
    }

    // Limit to 30 activities max to prevent abuse
    const limitedIds = ids.slice(0, 30);

    // Fetch in batches of 5 to avoid overwhelming Strava API
    const BATCH_SIZE = 5;
    const results: Record<string, unknown[]> = {};

    for (let i = 0; i < limitedIds.length; i += BATCH_SIZE) {
      const batch = limitedIds.slice(i, i + BATCH_SIZE);

      const batchResults = await Promise.all(
        batch.map(async (id) => {
          try {
            const bestEfforts = await getActivityBestEfforts(session.accessToken!, id);
            return { id, bestEfforts };
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
    return handleRouteError(error, "[Best Efforts] Error");
  }
}
