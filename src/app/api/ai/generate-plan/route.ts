import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { generateWeeklyPlan } from "@/lib/ai/plan-service";

export async function POST() {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken || !session?.stravaId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const plan = await generateWeeklyPlan(session.stravaId, session.accessToken);
    return NextResponse.json(plan);
  } catch (error: unknown) {
    console.error("[AI] Failed to generate plan:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
