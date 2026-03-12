export interface StravaLap {
  id: number;
  name: string;
  elapsed_time: number;
  moving_time: number;
  distance: number;
  average_speed: number;
  max_speed: number;
  average_heartrate?: number;
  max_heartrate?: number;
  lap_index: number;
  total_elevation_gain?: number;
  split?: number; // index
}

export interface StravaSplitMetric {
  distance: number;
  elapsed_time: number;
  average_speed: number;
  average_heartrate?: number;
  elevation_difference?: number;
}

export interface StravaGear {
  id: string;
  name: string;
  primary: boolean;
  distance: number;
}

export interface StravaActivity {
  id: number;
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
  calories?: number;
  description?: string;
  splits_metric?: StravaSplitMetric[];
  type?: string;
  sport_type?: string;
  best_efforts?: BestEffort[];
  trainer?: boolean;
  workout_type?: number;
  // New fields
  average_grade_adjusted_speed?: number; // GAP
  gear_id?: string;
  gear?: StravaGear;
  laps?: StravaLap[];
  start_latlng?: [number, number]; // [latitude, longitude]
}

export interface BestEffort {
  id: number;
  name: string;
  elapsed_time: number;
  moving_time: number;
  start_date: string;
  start_date_local: string;
  distance: number;
  pr_rank?: number;
}

export interface HeartRateZoneBucket {
  min: number;
  max: number;
  time: number;
}

export interface AthleteStats {
  all_run_totals: {
    count: number;
    distance: number;
    moving_time: number;
  };
  ytd_run_totals: {
    count: number;
    distance: number;
    moving_time: number;
  };
}

export interface ChartDataPoint {
  date: string;
  fullDate: string;
  distance: number;
  hr: number | null;
  pace: string;
  isTreadmill: boolean;
  name: string;
}
