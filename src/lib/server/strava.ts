import { filterValidRuns } from "@/lib/metrics";
import {
  AthleteStats,
  BestEffort,
  HeartRateZoneBucket,
  StravaActivity,
} from "@/types/strava";
import { upstreamError } from "./api";

const STRAVA_API_BASE = "https://www.strava.com/api/v3";

type StravaRequestOptions = {
  cache?: RequestCache;
  nextRevalidate?: number;
};

type StravaZoneResponse = {
  heart_rate?: {
    zones?: { min: number; max: number }[];
  };
};

type StravaActivityZone = {
  type?: string;
  distribution_buckets?: HeartRateZoneBucket[];
};

function buildRequestInit(accessToken: string, options: StravaRequestOptions = {}): RequestInit & {
  next?: { revalidate: number };
} {
  const init: RequestInit & { next?: { revalidate: number } } = {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: options.cache ?? "no-store",
  };

  if (options.nextRevalidate !== undefined) {
    init.next = { revalidate: options.nextRevalidate };
  }

  return init;
}

async function stravaFetchJson<T>(
  accessToken: string,
  path: string,
  options: StravaRequestOptions = {}
): Promise<T> {
  const response = await fetch(
    `${STRAVA_API_BASE}${path}`,
    buildRequestInit(accessToken, options)
  );

  if (!response.ok) {
    throw upstreamError(`Strava request failed (${response.status}).`, {
      path,
      status: response.status,
    });
  }

  return response.json() as Promise<T>;
}

export async function getAthleteProfile(accessToken: string) {
  return stravaFetchJson<Record<string, unknown>>(accessToken, "/athlete");
}

export async function getAthleteStats(accessToken: string, athleteId: number) {
  return stravaFetchJson<AthleteStats>(accessToken, `/athletes/${athleteId}/stats`);
}

export async function getAthleteActivities(
  accessToken: string,
  options: {
    after?: number;
    page?: number;
    perPage?: number;
    revalidate?: number;
  } = {}
): Promise<StravaActivity[]> {
  const params = new URLSearchParams();

  if (options.after !== undefined) {
    params.set("after", String(options.after));
  }

  if (options.page !== undefined) {
    params.set("page", String(options.page));
  }

  params.set("per_page", String(options.perPage ?? 30));

  return stravaFetchJson<StravaActivity[]>(
    accessToken,
    `/athlete/activities?${params.toString()}`,
    { nextRevalidate: options.revalidate }
  );
}

export async function getFilteredRunActivities(
  accessToken: string,
  options: {
    after?: number;
    perPage?: number;
    revalidate?: number;
  } = {}
): Promise<StravaActivity[]> {
  const activities = await getAthleteActivities(accessToken, options);
  return filterValidRuns(activities);
}

export async function getDetailedActivity(
  accessToken: string,
  activityId: number
): Promise<StravaActivity> {
  return stravaFetchJson<StravaActivity>(
    accessToken,
    `/activities/${activityId}?include_all_efforts=true`
  );
}

export async function getActivityBestEfforts(
  accessToken: string,
  activityId: number
): Promise<BestEffort[]> {
  const activity = await getDetailedActivity(accessToken, activityId);
  return activity.best_efforts ?? [];
}

export async function getActivityZones(
  accessToken: string,
  activityId: number
): Promise<StravaActivityZone[]> {
  return stravaFetchJson<StravaActivityZone[]>(
    accessToken,
    `/activities/${activityId}/zones`
  );
}

export async function getHeartRateZoneBuckets(
  accessToken: string,
  activityId: number
): Promise<HeartRateZoneBucket[]> {
  const zones = await getActivityZones(accessToken, activityId);
  return zones.find((zone) => zone.type === "heartrate")?.distribution_buckets ?? [];
}

export async function getAthleteHeartRateZones(
  accessToken: string
): Promise<{ min: number; max: number }[] | null> {
  try {
    const data = await stravaFetchJson<StravaZoneResponse>(accessToken, "/athlete/zones");
    const zones = data.heart_rate?.zones ?? null;
    return zones && zones.length >= 3 ? zones : null;
  } catch {
    return null;
  }
}
