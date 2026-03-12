import { FormattedActivity } from "@/types";
import { StravaActivity } from "@/types/strava";
import { getAthleteActivities, getDetailedActivity } from "@/lib/server/strava";

/**
 * Fetches the latest activity with full details (including splits)
 */
export async function getLatestActivity(
  accessToken: string
): Promise<StravaActivity | null> {
  try {
    const activities = await getAthleteActivities(accessToken, { page: 1, perPage: 1 });
    
    if (activities.length === 0) {
      return null;
    }

    return await getDetailedActivity(accessToken, activities[0].id);
  } catch (error) {
    console.error("Error fetching latest activity:", error);
    return null;
  }
}

export function formatActivity(activity: StravaActivity): FormattedActivity {
  // Convert distance from meters to kilometers
  const distanceKm = activity.distance / 1000;

  // Calculate pace (min/km)
  const paceSecondsPerKm = activity.moving_time / distanceKm;
  const paceMinutes = Math.floor(paceSecondsPerKm / 60);
  const paceSeconds = Math.round(paceSecondsPerKm % 60);

  // Format duration
  const hours = Math.floor(activity.moving_time / 3600);
  const minutes = Math.floor((activity.moving_time % 3600) / 60);
  const seconds = activity.moving_time % 60;

  const durationParts = [];
  if (hours > 0) durationParts.push(`${hours}h`);
  if (minutes > 0) durationParts.push(`${minutes}m`);
  if (seconds > 0 || durationParts.length === 0) durationParts.push(`${seconds}s`);

  // Format date
  const date = new Date(activity.start_date_local);
  const formattedDate = date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return {
    id: activity.id,
    name: activity.name,
    date: formattedDate,
    distance: `${distanceKm.toFixed(2)} km`,
    pace: `${paceMinutes}:${paceSeconds.toString().padStart(2, "0")} /km`,
    duration: durationParts.join(" "),
    type: activity.sport_type || activity.type || "Run",
    elevationGain: `${Math.round(activity.total_elevation_gain)} m`,
    averageHeartrate: activity.average_heartrate
      ? `${Math.round(activity.average_heartrate)} bpm`
      : undefined,
    maxHeartrate: activity.max_heartrate
      ? `${Math.round(activity.max_heartrate)} bpm`
      : undefined,
    calories: activity.calories ? `${activity.calories} kcal` : undefined,
  };
}
