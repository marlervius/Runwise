import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getOrCreateProfile, updateProfile } from "@/lib/db/user-profiles";
import { generateWeeklyPlan } from "@/lib/ai/plan-service";

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken || !session?.stravaId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      nextRaceDate,
      nextRaceDistance,
      trainingDaysPerWeek,
      treadmillPreference,
      maxHR,
      restingHR,
    } = body;

    // Create or update profile
    await getOrCreateProfile(session.stravaId);

    // Update with onboarding data
    await updateProfile(session.stravaId, {
      nextRaceDate: nextRaceDate || null,
      nextRaceDistance: nextRaceDistance || null,
      trainingDaysPerWeek: trainingDaysPerWeek || 4,
      treadmillPreference: treadmillPreference || "no",
      maxHR: maxHR || 0,
      restingHR: restingHR || 0,
      onboardingCompleted: true,
    });

    // Generate first weekly plan
    const plan = await generateWeeklyPlan(session.stravaId, session.accessToken);

    return NextResponse.json({ success: true, plan });
  } catch (error: unknown) {
    console.error("[Onboarding] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
