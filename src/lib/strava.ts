import { StravaActivity, FormattedActivity } from "@/types";

const STRAVA_API_BASE = "https://www.strava.com/api/v3";

/**
 * Fetches the latest activity with full details (including splits)
 */
export async function getLatestActivity(
  accessToken: string
): Promise<StravaActivity | null> {
  try {
    // First, get the list of activities to find the latest one
    const listResponse = await fetch(
      `${STRAVA_API_BASE}/athlete/activities?page=1&per_page=1`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!listResponse.ok) {
      throw new Error(`Strava API error: ${listResponse.status}`);
    }

    const activities: StravaActivity[] = await listResponse.json();
    
    if (activities.length === 0) {
      return null;
    }

    // Fetch detailed activity data (includes splits)
    const detailResponse = await fetch(
      `${STRAVA_API_BASE}/activities/${activities[0].id}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!detailResponse.ok) {
      throw new Error(`Strava API error: ${detailResponse.status}`);
    }

    const detailedActivity: StravaActivity = await detailResponse.json();
    return detailedActivity;
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
    type: activity.sport_type || activity.type,
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
