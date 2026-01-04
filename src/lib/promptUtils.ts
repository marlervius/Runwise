interface StravaActivity {
  name: string;
  start_date_local: string;
  distance: number; 
  moving_time: number; 
  total_elevation_gain: number; 
  average_speed: number; 
  max_speed: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number; 
  suffer_score?: number;
  description?: string;
  splits_metric?: any[]; 
}

// HARDCODED PROFILE (MVP Version) - We will make this editable later
const USER_PROFILE = `
RUNNER PROFILE:
- Max HR: 195 bpm
- Resting HR: 50 bpm
- Lactate Threshold: approx 172 bpm (4:15/km)
- Goal: Sub 3:30 Marathon
- Injury History: Tendency for shin splints on high volume.
`;

const formatDuration = (seconds: number): string => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h > 0 ? h + ':' : ''}${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

const formatPace = (speedMs: number): string => {
  if (speedMs === 0) return "0:00";
  const secondsPerKm = 1000 / speedMs;
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.floor(secondsPerKm % 60);
  return `${m}:${s.toString().padStart(2, '0')}/km`;
};

export const generateRunPrompt = (activity: StravaActivity): string => {
  const date = new Date(activity.start_date_local).toLocaleDateString('en-US'); 
  const distanceKm = (activity.distance / 1000).toFixed(2);
  const duration = formatDuration(activity.moving_time);
  const avgPace = formatPace(activity.average_speed);
  
  const hrInfo = activity.average_heartrate 
    ? `Heart Rate: Avg ${Math.round(activity.average_heartrate)} bpm, Max ${Math.round(activity.max_heartrate || 0)} bpm.`
    : "Heart Rate Data: Not available.";
    
  const cadenceInfo = activity.average_cadence 
    ? `Cadence: ${Math.round(activity.average_cadence * 2)} spm` 
    : "";

  let splitsText = "";
  if (activity.splits_metric && activity.splits_metric.length > 0) {
    splitsText = "\n[KM SPLITS]\n";
    activity.splits_metric.forEach((split: any, index: number) => {
      if (split.distance < 100) return; 
      const splitPace = formatPace(split.average_speed);
      const splitHr = split.average_heartrate ? `HR: ${Math.round(split.average_heartrate)}` : "";
      splitsText += `Km ${index + 1}: Time ${formatDuration(split.elapsed_time)} | Pace ${splitPace} | ${splitHr}\n`;
    });
  }

  return `
*** ACT AS A WORLD-CLASS RUNNING COACH & PHYSIOLOGIST ***

${USER_PROFILE}

CONTEXT:
I am a runner seeking detailed feedback on my latest session based on my profile above.

ACTIVITY SUMMARY:
- Name: "${activity.name}"
- Date: ${date}
- Type: Running
- Description: "${activity.description || 'None'}"

KEY METRICS:
- Distance: ${distanceKm} km
- Duration: ${duration}
- Average Pace: ${avgPace}
- Elevation Gain: ${Math.round(activity.total_elevation_gain)} m
- ${hrInfo}
- ${cadenceInfo}
${activity.suffer_score ? `- Suffer Score: ${activity.suffer_score}` : ''}

${splitsText}

TASK:
1. **Analyze execution:** Pacing strategy and cardiac drift?
2. **Intensity Zone:** Estimate the zone based on HR/Pace and my Max HR.
3. **Training Effect:** Physiological benefit (Base, Threshold, VO2)?
4. **Actionable Feedback:** 2 specific tips for next time.

Keep it concise.
`.trim();
};

export type { StravaActivity };
