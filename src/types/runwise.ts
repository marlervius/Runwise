// Runwise-specific types

export interface RunwiseUserProfile {
  id: string;
  stravaId: number;
  stravaAthleteJson?: Record<string, unknown>;
  maxHR: number;
  restingHR: number;
  lactateThreshold: string;
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
  description: string; // 1-2 sentences in Norwegian
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
