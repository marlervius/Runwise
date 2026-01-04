import { StravaActivity, StravaSplit } from "@/types";

/**
 * Formats seconds into a readable MM:SS or HH:MM:SS string
 */
function formatTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
}

/**
 * Formats pace from meters per second to MM:SS per kilometer
 */
function formatPace(metersPerSecond: number): string {
  if (metersPerSecond <= 0) return "N/A";
  const secondsPerKm = 1000 / metersPerSecond;
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.round(secondsPerKm % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * Formats distance from meters to kilometers
 */
function formatDistance(meters: number): string {
  return (meters / 1000).toFixed(2);
}

/**
 * Formats splits into a readable table-like string
 */
function formatSplits(splits: StravaSplit[]): string {
  if (!splits || splits.length === 0) return "No split data available";

  const lines = splits.map((split) => {
    const pace = formatPace(split.average_speed);
    const hr = split.average_heartrate
      ? `${Math.round(split.average_heartrate)} bpm`
      : "N/A";
    const elev =
      split.elevation_difference >= 0
        ? `+${split.elevation_difference.toFixed(0)}m`
        : `${split.elevation_difference.toFixed(0)}m`;

    return `  Km ${split.split}: ${pace} /km | HR: ${hr} | Elev: ${elev}`;
  });

  return lines.join("\n");
}

/**
 * Generates an AI-optimized running prompt from Strava activity data
 */
export function generateRunPrompt(activity: StravaActivity): string {
  const distance = formatDistance(activity.distance);
  const movingTime = formatTime(activity.moving_time);
  const avgPace = formatPace(activity.average_speed);
  const avgHR = activity.average_heartrate
    ? `${Math.round(activity.average_heartrate)} bpm`
    : "Not recorded";
  const maxHR = activity.max_heartrate
    ? `${Math.round(activity.max_heartrate)} bpm`
    : "Not recorded";
  const elevation = `${Math.round(activity.total_elevation_gain)}m`;
  const cadence = activity.average_cadence
    ? `${Math.round(activity.average_cadence * 2)} spm` // Strava reports half cadence
    : "Not recorded";

  // Format date nicely
  const date = new Date(activity.start_date_local);
  const formattedDate = date.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Build splits section
  const splits = activity.splits_metric || activity.splits_standard;
  const splitsSection = splits
    ? `
SPLITS (per kilometer):
${formatSplits(splits)}`
    : "";

  const prompt = `Act as an elite running coach analyzing my latest training run. Review the data below and provide:
1. A brief performance summary
2. Pacing analysis and consistency feedback
3. Heart rate zone assessment (if available)
4. Specific recommendations for my next run

---

RUN DATA

Activity: ${activity.name}
Date: ${formattedDate}
Type: ${activity.sport_type || activity.type}

STATS:
- Distance: ${distance} km
- Moving Time: ${movingTime}
- Average Pace: ${avgPace} /km
- Average Heart Rate: ${avgHR}
- Max Heart Rate: ${maxHR}
- Elevation Gain: ${elevation}
- Cadence: ${cadence}
${splitsSection}

---

Please analyze this run and give me actionable coaching feedback.`;

  return prompt.trim();
}
