import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { generatePostWorkoutFeedback } from "@/lib/ai/plan-service";
import { savePostWorkoutFeedback } from "@/lib/db/daily-workouts";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken || !session?.stravaId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { activity, plannedWorkout, workoutId, effort } = body;

    if (!activity || !plannedWorkout) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Generate AI feedback
    const feedback = await generatePostWorkoutFeedback(activity, plannedWorkout);

    // Save effort feedback if provided
    if (workoutId && effort) {
      await savePostWorkoutFeedback(workoutId, effort);
    }

    return NextResponse.json({ feedback });
  } catch (error: unknown) {
    console.error("[AI] Failed to generate feedback:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
