import { redirect } from "next/navigation";
import { isOnboardingComplete, getProfileByStravaId } from "@/lib/db/user-profiles";
import { VDOTClient } from "./vdot-client";
import { requireRunwiseSession } from "@/lib/server/auth";
import { getAthleteActivities } from "@/lib/server/strava";

export default async function VDOTPage() {
  let session;
  try {
    session = await requireRunwiseSession({ requireAccessToken: true });
  } catch {
    redirect("/");
  }

  const completed = await isOnboardingComplete(session.stravaId);
  if (!completed) {
    redirect("/onboarding");
  }

  const profile = await getProfileByStravaId(session.stravaId);
  const activities = await getAthleteActivities(session.accessToken!, {
    perPage: 200,
    revalidate: 300,
  }).catch(() => []);

  return (
    <VDOTClient
      activities={activities}
      maxHR={profile?.maxHR ?? 0}
      restingHR={profile?.restingHR ?? 0}
      profile={profile}
    />
  );
}
