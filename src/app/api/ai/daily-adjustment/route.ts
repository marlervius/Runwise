import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { adjustDailyWorkout } from "@/lib/ai/plan-service";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken || !session?.stravaId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const mood = body.mood as "tired" | "normal" | "strong";

    if (!["tired", "normal", "strong"].includes(mood)) {
      return NextResponse.json({ error: "Invalid mood value" }, { status: 400 });
    }

    const result = await adjustDailyWorkout(session.stravaId, session.accessToken, mood);
    return NextResponse.json(result);
  } catch (error: unknown) {
    console.error("[AI] Failed to adjust workout:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
