import { NextResponse } from "next/server";
import { generateWeeklyPlan } from "@/lib/ai/plan-service";
import { handleRouteError } from "@/lib/server/api";
import { requireRunwiseSession } from "@/lib/server/auth";

export async function POST() {
  try {
    const session = await requireRunwiseSession({ requireAccessToken: true });
    console.log("[AI] Starting plan generation for stravaId:", session.stravaId);
    const plan = await generateWeeklyPlan(session.stravaId, session.accessToken!);
    console.log("[AI] Plan generated successfully, days:", plan.days?.length);
    return NextResponse.json(plan);
  } catch (error) {
    return handleRouteError(error, "[AI] Failed to generate plan");
  }
}
