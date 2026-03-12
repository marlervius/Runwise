import { NextRequest, NextResponse } from "next/server";
import { adjustDailyWorkout } from "@/lib/ai/plan-service";
import { handleRouteError, readJsonBody } from "@/lib/server/api";
import { requireRunwiseSession } from "@/lib/server/auth";
import { asObject, parseRequiredEnum } from "@/lib/server/validation";

export async function POST(request: NextRequest) {
  try {
    const session = await requireRunwiseSession({ requireAccessToken: true });
    const body = asObject(await readJsonBody(request));
    const mood = parseRequiredEnum(body.mood, "mood", ["tired", "normal", "strong"] as const);
    const result = await adjustDailyWorkout(session.stravaId, session.accessToken!, mood);
    return NextResponse.json(result);
  } catch (error) {
    return handleRouteError(error, "[AI] Failed to adjust workout");
  }
}
