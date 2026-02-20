import { StravaActivity, HeartRateZoneBucket, BestEffort } from "@/types/strava";
import { WeatherData } from "./weather";

const CACHE_PREFIX = "runprompt_activity_";

interface CachedActivityDetail {
  detailed: Partial<StravaActivity>;
  heartRateZones: HeartRateZoneBucket[];
  bestEfforts: BestEffort[];
  weather?: WeatherData | null;
  timestamp: number; // For expiration if needed later
}

// 7 days expiration for detailed activity cache
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export const getCachedActivityDetail = (activityId: number): CachedActivityDetail | null => {
  if (typeof window === "undefined") return null;
  
  try {
    const cached = localStorage.getItem(`${CACHE_PREFIX}${activityId}`);
    if (!cached) return null;
    
    const parsed = JSON.parse(cached) as CachedActivityDetail;
    const now = Date.now();
    
    // Check if cache has expired
    if (parsed.timestamp && now - parsed.timestamp > CACHE_TTL_MS) {
      localStorage.removeItem(`${CACHE_PREFIX}${activityId}`);
      return null;
    }
    
    return parsed;
  } catch (error) {
    console.error("Error reading from activity cache:", error);
    return null;
  }
};

export const setCachedActivityDetail = (
  activityId: number, 
  detailed: Partial<StravaActivity>, 
  heartRateZones: HeartRateZoneBucket[], 
  bestEfforts: BestEffort[],
  weather: WeatherData | null = null
): void => {
  if (typeof window === "undefined") return;
  
  try {
    const cacheData: CachedActivityDetail = {
      detailed,
      heartRateZones,
      bestEfforts,
      weather,
      timestamp: Date.now()
    };
    
    localStorage.setItem(`${CACHE_PREFIX}${activityId}`, JSON.stringify(cacheData));
  } catch (error) {
    // If localStorage is full, we can try to clear old entries
    console.error("Error writing to activity cache (maybe full):", error);
    tryClearOldCache();
  }
};

// Helper to clean up old cache entries if quota exceeded
const tryClearOldCache = () => {
  if (typeof window === "undefined") return;
  
  try {
    const keysToRemove: string[] = [];
    
    // Find all cache keys
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_PREFIX)) {
        keysToRemove.push(key);
      }
    }
    
    // Sort by timestamp (oldest first) if we want to be smart,
    // but simple approach is just delete the oldest half or clear all cache for activities
    // Since it's just local cache, we can safely wipe them all if we hit limit
    keysToRemove.forEach(k => localStorage.removeItem(k));
    console.log(`Cleared ${keysToRemove.length} cached activities to free space.`);
  } catch (e) {
    console.error("Failed to clear cache:", e);
  }
};
