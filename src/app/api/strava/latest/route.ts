import { NextResponse } from "next/server";
import { getLatestActivity, formatActivity } from "@/lib/strava";
import { generateRunPrompt } from "@/lib/promptUtils";
import { handleRouteError } from "@/lib/server/api";
import { requireRunwiseSession } from "@/lib/server/auth";

export async function GET() {
  try {
    const session = await requireRunwiseSession({ requireAccessToken: true });

    const activity = await getLatestActivity(session.accessToken!);

    if (!activity) {
      return NextResponse.json(
        { activity: null, formatted: null, prompt: null },
        { status: 200 }
      );
    }

    const formatted = formatActivity(activity);
    const prompt = generateRunPrompt(activity);

    return NextResponse.json({
      activity,
      formatted,
      prompt,
    });
  } catch (error) {
    return handleRouteError(error, "Error in /api/strava/latest");
  }
}
