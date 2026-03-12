import { NextRequest, NextResponse } from "next/server";
import { generatePostWorkoutFeedback } from "@/lib/ai/plan-service";
import { getProfileByStravaId } from "@/lib/db/user-profiles";
import { savePostWorkoutFeedback } from "@/lib/db/daily-workouts";
import { WeeklyPlanDay } from "@/types/runwise";
import { StravaActivity } from "@/types/strava";
import { badRequest, handleRouteError, notFound, readJsonBody } from "@/lib/server/api";
import { requireRunwiseSession } from "@/lib/server/auth";
import { asObject, hasField, parseOptionalEnum, parseOptionalString } from "@/lib/server/validation";

const EFFORT_VALUES = ["harder", "as_planned", "easier"] as const;

function isMinimalActivity(value: unknown): value is StravaActivity {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const activity = value as Record<string, unknown>;
  return (
    typeof activity.name === "string" &&
    typeof activity.distance === "number" &&
    typeof activity.moving_time === "number" &&
    typeof activity.average_speed === "number"
  );
}

function isWeeklyPlanDay(value: unknown): value is WeeklyPlanDay {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const day = value as Record<string, unknown>;
  return (
    typeof day.date === "string" &&
    typeof day.workoutType === "string" &&
    typeof day.workoutTypeNorwegian === "string" &&
    typeof day.description === "string" &&
    typeof day.durationMinutes === "number" &&
    typeof day.estimatedDistanceKm === "number"
  );
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireRunwiseSession({ requireAccessToken: true });
    const body = asObject(await readJsonBody(request));

    const workoutId = hasField(body, "workoutId")
      ? parseOptionalString(body.workoutId, "workoutId", { allowEmpty: false })
      : undefined;
    const effort = hasField(body, "effort")
      ? parseOptionalEnum(body.effort, "effort", EFFORT_VALUES)
      : undefined;
    const activity = hasField(body, "activity") ? body.activity : undefined;
    const plannedWorkout = hasField(body, "plannedWorkout") ? body.plannedWorkout : undefined;

    const shouldSaveFeedback = workoutId !== undefined || effort !== undefined;
    const shouldGenerateFeedback = activity !== undefined || plannedWorkout !== undefined;

    if (!shouldSaveFeedback && !shouldGenerateFeedback) {
      throw badRequest("Request must include workout feedback to save or workout data to summarize.");
    }

    if ((workoutId && !effort) || (!workoutId && effort)) {
      throw badRequest("workoutId and effort must be provided together.");
    }

    if ((activity && !plannedWorkout) || (!activity && plannedWorkout)) {
      throw badRequest("activity and plannedWorkout must be provided together.");
    }

    let feedback: string | null = null;

    if (shouldGenerateFeedback) {
      if (!isMinimalActivity(activity)) {
        throw badRequest("activity payload is invalid.");
      }

      if (!isWeeklyPlanDay(plannedWorkout)) {
        throw badRequest("plannedWorkout payload is invalid.");
      }

      feedback = await generatePostWorkoutFeedback(activity, plannedWorkout);
    }

    if (shouldSaveFeedback) {
      const profile = await getProfileByStravaId(session.stravaId);
      if (!profile) {
        throw notFound("Profile not found");
      }

      await savePostWorkoutFeedback(profile.id, workoutId!, effort!);
    }

    return NextResponse.json({ feedback });
  } catch (error) {
    return handleRouteError(error, "[AI] Failed to process post-workout feedback");
  }
}
