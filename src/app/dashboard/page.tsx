import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "../api/auth/[...nextauth]/route";
import DashboardClient from "./dashboard-client";

interface AthleteStats {
  biggest_ride_distance: number;
  biggest_climb_elevation_gain: number;
  recent_run_totals: {
    count: number;
    distance: number;
    moving_time: number;
    elapsed_time: number;
    elevation_gain: number;
  };
  all_run_totals: {
    count: number;
    distance: number;
    moving_time: number;
    elapsed_time: number;
    elevation_gain: number;
  };
  ytd_run_totals: {
    count: number;
    distance: number;
    moving_time: number;
    elapsed_time: number;
    elevation_gain: number;
  };
}

interface BestEffort {
  id: number;
  name: string;
  elapsed_time: number;
  moving_time: number;
  start_date: string;
  start_date_local: string;
  distance: number;
  pr_rank?: number;
}

interface HeartRateZone {
  min: number;
  max: number;
  score?: number;
  distribution_buckets?: {
    max: number;
    min: number;
    time: number;
  }[];
  type?: string;
  resource_state?: number;
  sensor_based?: boolean;
  points?: number;
  custom_zones?: boolean;
}

async function getAthleteProfile(accessToken: string) {
  console.log("[Strava] Fetching athlete profile...");
  
  const res = await fetch("https://www.strava.com/api/v3/athlete", {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!res.ok) {
    console.error("[Strava] Failed to fetch athlete profile:", res.status);
    return null;
  }

  return await res.json();
}

async function getAthleteStats(accessToken: string, athleteId: number): Promise<AthleteStats | null> {
  console.log("[Strava] Fetching athlete stats...");
  
  const res = await fetch(
    `https://www.strava.com/api/v3/athletes/${athleteId}/stats`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    }
  );

  if (!res.ok) {
    console.error("[Strava] Failed to fetch athlete stats:", res.status);
    return null;
  }

  return await res.json();
}

async function getRecentActivities(accessToken: string) {
  console.log("[Strava] Fetching last 30 activities...");
  
  const res = await fetch(
    "https://www.strava.com/api/v3/athlete/activities?per_page=30",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store", 
    }
  );

  console.log("[Strava] Response status:", res.status);
  
  if (!res.ok) {
    const errorText = await res.text();
    console.error("[Strava] API Error:", res.status, errorText);
    return [];
  }
  
  const activities = await res.json();
  console.log("[Strava] Activities found:", activities.length);
  return activities;
}

async function getDetailedActivity(accessToken: string, activityId: number) {
  console.log("[Strava] Fetching detailed activity:", activityId);
  
  const res = await fetch(
    `https://www.strava.com/api/v3/activities/${activityId}?include_all_efforts=true`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    }
  );

  if (!res.ok) {
    console.error("[Strava] Failed to fetch detailed activity:", res.status);
    return null;
  }

  return await res.json();
}

async function getActivityZones(accessToken: string, activityId: number): Promise<HeartRateZone[] | null> {
  console.log("[Strava] Fetching activity zones:", activityId);
  
  const res = await fetch(
    `https://www.strava.com/api/v3/activities/${activityId}/zones`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    }
  );

  if (!res.ok) {
    console.error("[Strava] Failed to fetch activity zones:", res.status);
    return null;
  }

  return await res.json();
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session || !session.accessToken) {
    redirect("/");
  }

  // Fetch athlete profile first to get athlete ID
  const athlete = await getAthleteProfile(session.accessToken);
  
  // Fetch all data in parallel
  const [activities, athleteStats] = await Promise.all([
    getRecentActivities(session.accessToken),
    athlete ? getAthleteStats(session.accessToken, athlete.id) : null,
  ]);

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
    getDetailedActivity(session.accessToken, latestActivityId),
    getActivityZones(session.accessToken, latestActivityId),
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
  
  // Extract heart rate zones
  const heartRateZones = activityZones?.find((z: any) => z.type === 'heartrate')?.distribution_buckets || [];

  // Pass everything to the client
  return (
    <DashboardClient 
      activities={activities} 
      athleteStats={athleteStats}
      bestEfforts={bestEfforts}
      heartRateZones={heartRateZones}
    />
  );
}
