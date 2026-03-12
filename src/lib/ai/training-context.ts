import {
  ACWRMetrics,
  DanielsTrainingPaces,
  MissedTrainingAnalysis,
  analyzeMissedTraining,
  calculateACWR,
  calculateConsistencyMetrics,
  calculateHRZones,
  calculateWeeklyVolumes,
  detectSingleSessionSpike,
  estimateVDOTFromTempo,
  getDanielsTrainingPaces,
  getPeriodizationContext,
  mapStravaZonesToHRZones,
} from "@/lib/metrics";
import { formatPace } from "@/lib/prompt-generator";
import { getAthleteHeartRateZones, getFilteredRunActivities } from "@/lib/server/strava";
import { RunwiseUserProfile } from "@/types/runwise";
import { StravaActivity } from "@/types/strava";

export type ResolvedHrZone = {
  zone: string;
  min: number;
  max: number;
};

export type TrainingContext = {
  activities: StravaActivity[];
  maxHR: number;
  vdot: number;
  effectiveVdot: number;
  danielsPaces: DanielsTrainingPaces | null;
  effectiveDanielsPaces: DanielsTrainingPaces | null;
  acwr: ACWRMetrics | null;
  weeklyVolumes: ReturnType<typeof calculateWeeklyVolumes>;
  consistencyMetrics: ReturnType<typeof calculateConsistencyMetrics>;
  hrZones: ResolvedHrZone[];
  hrZonesSource: string;
  missedTraining: MissedTrainingAnalysis;
  spikeRisk: ReturnType<typeof detectSingleSessionSpike>;
  periodization: ReturnType<typeof getPeriodizationContext>;
};

export function detectMaxHR(activities: StravaActivity[], profileMaxHR: number): number {
  if (profileMaxHR > 0) return profileMaxHR;

  let observedMax = 0;
  for (const activity of activities) {
    if (activity.max_heartrate && activity.max_heartrate > observedMax) {
      observedMax = activity.max_heartrate;
    }
  }

  return observedMax;
}

export function buildRecentActivitySummary(
  activities: StravaActivity[],
  count: number = 5
): string {
  return activities
    .slice(0, count)
    .map((activity) => {
      const distanceKm = (activity.distance / 1000).toFixed(1);
      const pacePerKm = activity.average_speed > 0 ? formatPace(activity.average_speed) : "-";
      const date = new Date(activity.start_date_local).toLocaleDateString("no-NO", {
        weekday: "short",
        day: "numeric",
        month: "short",
      });

      return `${date}: ${distanceKm}km @ ${pacePerKm}${
        activity.average_heartrate ? ` (HR: ${Math.round(activity.average_heartrate)})` : ""
      }`;
    })
    .join("\n");
}

export async function buildTrainingContext(
  profile: RunwiseUserProfile,
  accessToken: string,
  activityCount: number
): Promise<TrainingContext> {
  const [activities, stravaZonesBuckets] = await Promise.all([
    getFilteredRunActivities(accessToken, { perPage: activityCount }),
    getAthleteHeartRateZones(accessToken),
  ]);

  const maxHR = detectMaxHR(activities, profile.maxHR);
  const vdot = estimateVDOTFromTempo(activities, maxHR, profile.restingHR);
  const danielsPaces = getDanielsTrainingPaces(vdot);
  const acwr = calculateACWR(activities);
  const weeklyVolumes = calculateWeeklyVolumes(activities);
  const consistencyMetrics = calculateConsistencyMetrics(activities);
  const missedTraining = analyzeMissedTraining(activities);
  const spikeRisk = detectSingleSessionSpike(activities);
  const periodization = getPeriodizationContext(
    profile.nextRaceDate ?? null,
    profile.nextRaceDistance ?? null
  );
  const effectiveVdot =
    missedTraining.vdotAdjustmentPct > 0
      ? vdot * (1 - missedTraining.vdotAdjustmentPct / 100)
      : vdot;
  const effectiveDanielsPaces = getDanielsTrainingPaces(effectiveVdot);

  let hrZones: ResolvedHrZone[];
  let hrZonesSource: string;

  if (profile.customHrZones && profile.customHrZones.length >= 5 && maxHR > 0) {
    hrZones = mapStravaZonesToHRZones(profile.customHrZones, maxHR);
    hrZonesSource = "custom (profile)";
  } else if (stravaZonesBuckets && maxHR > 0) {
    hrZones = mapStravaZonesToHRZones(stravaZonesBuckets, maxHR);
    hrZonesSource = "Strava API";
  } else {
    hrZones = calculateHRZones(maxHR);
    hrZonesSource = "calculated from maxHR";
  }

  return {
    activities,
    maxHR,
    vdot,
    effectiveVdot,
    danielsPaces,
    effectiveDanielsPaces,
    acwr,
    weeklyVolumes,
    consistencyMetrics,
    hrZones,
    hrZonesSource,
    missedTraining,
    spikeRisk,
    periodization,
  };
}
