import { NextResponse } from "next/server";
import { updateProfile, getProfileByStravaId } from "@/lib/db/user-profiles";
import { badRequest, handleRouteError, notFound, readJsonBody } from "@/lib/server/api";
import { requireRunwiseSession } from "@/lib/server/auth";
import {
  asObject,
  hasField,
  parseOptionalDateString,
  parseOptionalEnum,
  parseOptionalHrZones,
  parseOptionalNullableString,
  parseOptionalNumber,
  parseOptionalString,
} from "@/lib/server/validation";

const TREADMILL_PREFERENCES = ["yes", "no", "sometimes"] as const;

function parseProfileUpdates(body: unknown): Parameters<typeof updateProfile>[1] {
  const payload = asObject(body);
  const updates: Parameters<typeof updateProfile>[1] = {};

  if (hasField(payload, "maxHR")) {
    updates.maxHR = parseOptionalNumber(payload.maxHR, "maxHR", { integer: true, min: 0, max: 250 });
  }

  if (hasField(payload, "restingHR")) {
    updates.restingHR = parseOptionalNumber(payload.restingHR, "restingHR", {
      integer: true,
      min: 0,
      max: 120,
    });
  }

  if (hasField(payload, "lactateThreshold")) {
    updates.lactateThreshold = parseOptionalString(payload.lactateThreshold, "lactateThreshold", {
      maxLength: 80,
    });
  }

  if (hasField(payload, "goal")) {
    updates.goal = parseOptionalString(payload.goal, "goal", { maxLength: 300 });
  }

  if (hasField(payload, "nextRaceDate")) {
    updates.nextRaceDate = parseOptionalDateString(payload.nextRaceDate, "nextRaceDate");
  }

  if (hasField(payload, "nextRaceDistance")) {
    updates.nextRaceDistance = parseOptionalNullableString(
      payload.nextRaceDistance,
      "nextRaceDistance",
      { maxLength: 80 }
    );
  }

  if (hasField(payload, "trainingDaysPerWeek")) {
    updates.trainingDaysPerWeek = parseOptionalNumber(payload.trainingDaysPerWeek, "trainingDaysPerWeek", {
      integer: true,
      min: 1,
      max: 7,
    });
  }

  if (hasField(payload, "treadmillPreference")) {
    updates.treadmillPreference = parseOptionalEnum(
      payload.treadmillPreference,
      "treadmillPreference",
      TREADMILL_PREFERENCES
    );
  }

  if (hasField(payload, "injuryHistory")) {
    updates.injuryHistory = parseOptionalString(payload.injuryHistory, "injuryHistory", {
      maxLength: 2000,
    });
  }

  if (hasField(payload, "aiPersonality")) {
    updates.aiPersonality = parseOptionalString(payload.aiPersonality, "aiPersonality", {
      maxLength: 120,
    });
  }

  if (hasField(payload, "customHrZones")) {
    updates.customHrZones = parseOptionalHrZones(payload.customHrZones, "customHrZones");
  }

  if (Object.keys(updates).length === 0) {
    throw badRequest("No supported profile fields were provided.");
  }

  return updates;
}

// GET /api/profile — fetch current profile
export async function GET() {
  try {
    const session = await requireRunwiseSession();
    const profile = await getProfileByStravaId(session.stravaId);

    if (!profile) {
      throw notFound("Profile not found");
    }

    return NextResponse.json(profile);
  } catch (error) {
    return handleRouteError(error, "[API/profile GET]");
  }
}

// PATCH /api/profile — update profile fields
export async function PATCH(req: Request) {
  try {
    const session = await requireRunwiseSession();
    const body = await readJsonBody(req);
    const updates = parseProfileUpdates(body);
    const profile = await updateProfile(session.stravaId, updates);

    return NextResponse.json(profile);
  } catch (error) {
    return handleRouteError(error, "[API/profile PATCH]");
  }
}
