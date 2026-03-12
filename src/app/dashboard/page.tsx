import { redirect } from "next/navigation";
import DashboardClient from "./dashboard-client";
import { requireRunwiseSession } from "@/lib/server/auth";
import {
  getAthleteActivities,
  getDetailedActivity,
  getHeartRateZoneBuckets,
} from "@/lib/server/strava";
import { BestEffort, HeartRateZoneBucket } from "@/types/strava";

export default async function DashboardPage() {
  let session;
  try {
    session = await requireRunwiseSession({ requireAccessToken: true });
  } catch {
    redirect("/");
  }

  const activities = await getAthleteActivities(session.accessToken!, { perPage: 30 });

  if (!activities || activities.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950 text-white">
        <h2 className="text-xl">No recent activities found on Strava.</h2>
      </div>
    );
  }

  // Fetch detailed data for the latest activity (includes best_efforts and can get zones)
  const latestActivityId = activities[0].id;
  const [detailedActivity, activityZones] = await Promise.all([
    getDetailedActivity(session.accessToken!, latestActivityId).catch(() => null),
    getHeartRateZoneBuckets(session.accessToken!, latestActivityId).catch(() => []),
  ]);

  // Merge detailed data into the first activity
  if (detailedActivity) {
    activities[0] = {
      ...activities[0],
      ...detailedActivity,
    };
  }

  // Extract best efforts (PRs) from the detailed activity
  const bestEfforts: BestEffort[] = detailedActivity?.best_efforts || [];
  const heartRateZones: HeartRateZoneBucket[] = activityZones;

  // Pass everything to the client
  return (
    <DashboardClient 
      activities={activities} 
      bestEfforts={bestEfforts}
      heartRateZones={heartRateZones}
    />
  );
}
