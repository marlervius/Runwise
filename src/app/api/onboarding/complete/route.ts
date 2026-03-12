import { NextRequest, NextResponse } from "next/server";
import { getOrCreateProfile, updateProfile } from "@/lib/db/user-profiles";
import { generateWeeklyPlan } from "@/lib/ai/plan-service";
import { handleRouteError, readJsonBody } from "@/lib/server/api";
import { requireRunwiseSession } from "@/lib/server/auth";
import {
  asObject,
  hasField,
  parseOptionalDateString,
  parseOptionalEnum,
  parseOptionalNullableString,
  parseOptionalNumber,
} from "@/lib/server/validation";

const TREADMILL_PREFERENCES = ["yes", "no", "sometimes"] as const;

function parseOnboardingPayload(body: unknown) {
  const payload = asObject(body);

  const trainingDaysPerWeek = hasField(payload, "trainingDaysPerWeek")
    ? parseOptionalNumber(payload.trainingDaysPerWeek, "trainingDaysPerWeek", {
        integer: true,
        min: 1,
        max: 7,
      })
    : 4;

  const treadmillPreference = hasField(payload, "treadmillPreference")
    ? parseOptionalEnum(payload.treadmillPreference, "treadmillPreference", TREADMILL_PREFERENCES)
    : "no";

  const maxHR = hasField(payload, "maxHR")
    ? parseOptionalNumber(payload.maxHR, "maxHR", { integer: true, min: 0, max: 250 })
    : 0;

  const restingHR = hasField(payload, "restingHR")
    ? parseOptionalNumber(payload.restingHR, "restingHR", { integer: true, min: 0, max: 120 })
    : 0;

  return {
    nextRaceDate: parseOptionalDateString(payload.nextRaceDate, "nextRaceDate") ?? null,
    nextRaceDistance:
      parseOptionalNullableString(payload.nextRaceDistance, "nextRaceDistance", { maxLength: 80 }) ?? null,
    trainingDaysPerWeek: trainingDaysPerWeek ?? 4,
    treadmillPreference: treadmillPreference ?? "no",
    maxHR: maxHR ?? 0,
    restingHR: restingHR ?? 0,
  };
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireRunwiseSession({ requireAccessToken: true });
    const body = await readJsonBody(request);
    const payload = parseOnboardingPayload(body);

    // Create or update profile
    await getOrCreateProfile(session.stravaId);

    // Update with onboarding data
    await updateProfile(session.stravaId, {
      nextRaceDate: payload.nextRaceDate,
      nextRaceDistance: payload.nextRaceDistance,
      trainingDaysPerWeek: payload.trainingDaysPerWeek,
      treadmillPreference: payload.treadmillPreference,
      maxHR: payload.maxHR,
      restingHR: payload.restingHR,
      onboardingCompleted: true,
    });

    // Generate first weekly plan
    const plan = await generateWeeklyPlan(session.stravaId, session.accessToken!);

    return NextResponse.json({ success: true, plan });
  } catch (error) {
    return handleRouteError(error, "[Onboarding] Error");
  }
}
