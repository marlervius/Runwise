// Runwise-specific types

export interface HRZone {
  min: number;
  max: number;
}

export interface RunwiseUserProfile {
  id: string;
  stravaId: number;
  stravaAthleteJson?: Record<string, unknown>;
  maxHR: number;
  restingHR: number;
  lactateThreshold: string;
  /** User's custom HR zone boundaries [Z1, Z2, Z3, Z4, Z5]. Overrides calculated zones when set. */
  customHrZones?: HRZone[] | null;
  goal: string;
  nextRaceDate: string | null;
  nextRaceDistance: string | null;
  trainingDaysPerWeek: number;
  treadmillPreference: "yes" | "no" | "sometimes";
  injuryHistory: string;
  aiPersonality: string;
  onboardingCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Én fase i øktstrukturen (oppvarming, hoveddel, nedkjøling, drag osv.) */
export interface WorkoutPhase {
  phase: string;       // "Oppvarming", "5 × 4 min hardt", "Nedkjøling" osv.
  duration: string;    // "10 min", "4 × 4 min" osv.
  pace?: string;       // "5:00–5:30/km"
  hrZone?: string;     // "Z4–Z5"
  note?: string;       // "3 min rolig mellom hvert drag"
}

export interface WeeklyPlanDay {
  dayOfWeek: number; // 1=Monday, 7=Sunday
  date: string; // ISO date
  workoutType:
    | "easy"
    | "threshold"
    | "interval"
    | "long"
    | "rest"
    | "recovery";
  workoutTypeNorwegian: string;
  durationMinutes: number;
  estimatedDistanceKm: number;
  intensityZone: string;
  hrZone?: string;
  paceZone?: string;
  description: string; // 1-2 sentences in Norwegian, warm and personal
  structure?: WorkoutPhase[]; // Detailed phase breakdown for WorkoutDetail modal
  treadmillVariant?: string;
  isHardDay: boolean;
}

export interface WeeklyPlan {
  id: string;
  userId: string;
  weekStart: string; // ISO date, always Monday
  days: WeeklyPlanDay[];
  totalVolumeKm: number;
  hardDayCount: number;
  rationale: string;
  weekFocus?: string; // Short human-readable weekly summary shown in UI
  createdAt: string;
}

export type WorkoutReviewRating = "excellent" | "good" | "ok" | "hard" | "missed";

export interface WorkoutReview {
  id: string;
  userId: string;
  stravaActivityId: number;
  rating: WorkoutReviewRating;
  headline: string;
  body: string;
  keyObservation?: string;
  nextImplication?: string;
  actualVsPlanned?: {
    distanceDiffKm: number;
    paceDiffSec: number;
    withinPlan: boolean;
  };
  createdAt: string;
}

export interface DailyWorkout {
  id: string;
  userId: string;
  date: string;
  workout: WeeklyPlanDay;
  moodInput?: "tired" | "normal" | "strong";
  moodAdjusted?: WeeklyPlanDay;
  moodAdjustmentExplanation?: string;
  stravaActivityId?: number;
  feedbackEffort?: "harder" | "as_planned" | "easier";
  feedbackNote?: string;
  aiSummary?: string;
  createdAt: string;
  invalidatedAt?: string;
}
