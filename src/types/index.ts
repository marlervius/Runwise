// Strava Split (per kilometer or mile)
export interface StravaSplit {
  distance: number; // in meters
  elapsed_time: number; // in seconds
  elevation_difference: number; // in meters
  moving_time: number; // in seconds
  split: number; // split number (1, 2, 3, ...)
  average_speed: number; // meters per second
  average_heartrate?: number;
  pace_zone?: number;
}

// Strava Activity Types
export interface StravaActivity {
  id: number;
  name: string;
  distance: number; // in meters
  moving_time: number; // in seconds
  elapsed_time: number; // in seconds
  total_elevation_gain: number; // in meters
  type: string;
  sport_type: string;
  start_date: string;
  start_date_local: string;
  timezone: string;
  average_speed: number; // meters per second
  max_speed: number; // meters per second
  average_heartrate?: number;
  max_heartrate?: number;
  average_cadence?: number;
  calories?: number;
  description?: string;
  workout_type?: number;
  splits_metric?: StravaSplit[]; // splits per kilometer
  splits_standard?: StravaSplit[]; // splits per mile
}

export interface StravaAthlete {
  id: number;
  firstname: string;
  lastname: string;
  profile: string;
  city?: string;
  country?: string;
}

// Formatted activity data for display
export interface FormattedActivity {
  id: number;
  name: string;
  date: string;
  distance: string;
  pace: string;
  duration: string;
  type: string;
  elevationGain: string;
  averageHeartrate?: string;
  maxHeartrate?: string;
  calories?: string;
}
