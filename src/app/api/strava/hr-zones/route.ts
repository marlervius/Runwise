import { NextResponse } from "next/server";
import { handleRouteError } from "@/lib/server/api";
import { requireRunwiseSession } from "@/lib/server/auth";
import {
  getAthleteActivities,
  getAthleteHeartRateZones,
  getAthleteProfile,
} from "@/lib/server/strava";

/**
 * GET /api/strava/hr-zones
 *
 * Fetches the athlete's heart rate zones from Strava,
 * and also scans recent activities for the highest recorded max_heartrate.
 *
 * Returns:
 *  - stravaZones: the HR zone buckets from Strava's athlete zones endpoint
 *  - detectedMaxHR: the highest max_heartrate seen across recent activities
 *  - stravaMaxHR: the athlete's max_hr field from their Strava profile (if set)
 */
export async function GET() {
  try {
    const session = await requireRunwiseSession({ requireAccessToken: true });
    const token = session.accessToken!;
    const after = Math.floor((Date.now() - 365 * 24 * 60 * 60 * 1000) / 1000);
    const [stravaZones, activities, athlete] = await Promise.all([
      getAthleteHeartRateZones(token),
      getAthleteActivities(token, { after, perPage: 100 }),
      getAthleteProfile(token),
    ]);

    // stravaMaxHR is the upper bound of the highest zone (if custom zones are set)
    const stravaMaxHR = stravaZones
      ? Math.max(...stravaZones.map((z: { max: number }) => z.max).filter((v: number) => v > 0 && v < 999))
      : null;

    let detectedMaxHR = 0;
    for (const act of activities) {
      if (typeof act.max_heartrate === "number" && act.max_heartrate > detectedMaxHR) {
        detectedMaxHR = act.max_heartrate;
      }
    }

    // Strava athlete profile may have a max_heartrate if user has worn an HR monitor
    const athleteMaxHR =
      typeof athlete.max_heartrate === "number" ? athlete.max_heartrate : null;

    // Best estimate: prefer athlete profile > activity scan > Strava zones
    const bestMaxHR = athleteMaxHR || (detectedMaxHR > 0 ? detectedMaxHR : null) || stravaMaxHR;

    return NextResponse.json({
      stravaZones,
      stravaMaxHR,
      detectedMaxHR: detectedMaxHR || null,
      athleteMaxHR,
      bestMaxHR,
      activitiesScanned: activities.length,
    });
  } catch (error) {
    return handleRouteError(error, "[API/strava/hr-zones]");
  }
}
