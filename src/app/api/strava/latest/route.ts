import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";
import { getLatestActivity, formatActivity } from "@/lib/strava";
import { generateRunPrompt } from "@/lib/promptUtils";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.accessToken) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const activity = await getLatestActivity(session.accessToken);

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
    console.error("Error in /api/strava/latest:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
