"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Activity, Calendar, Clock, MapPin, Copy, Check, Timer, TrendingUp, BarChart3, Heart, Trophy, Zap, Sparkles, RefreshCw, Info, Gauge, History, ChevronLeft, ChevronRight } from "lucide-react";
import { 
  SettingsDialog, 
  UserProfile, 
  DEFAULT_PROFILE, 
  loadProfileFromStorage,
  hasStoredProfile
} from "@/components/settings-dialog";
import { ProTipsDialog } from "@/components/pro-tips-dialog";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

import { 
  StravaActivity, 
  HeartRateZoneBucket, 
  BestEffort, 
  AthleteStats, 
  ChartDataPoint 
} from "@/types/strava";

import { 
  filterValidRuns, 
  calculateTrainingLoad 
} from "@/lib/metrics";

import { 
  generateSystemPrompt, 
  generateUpdatePrompt, 
  getKeyPRs,
  formatDurationLong,
  formatPace,
  formatShortDate,
  ZONE_COLORS,
  RPE_LABELS
} from "@/lib/prompt-generator";

import { getCachedActivityDetail, setCachedActivityDetail } from "@/lib/cache";
import { getHistoricalWeather, WeatherData } from "@/lib/weather";

interface DashboardClientProps {
  activities: StravaActivity[];
  athleteStats: AthleteStats | null;
  bestEfforts: BestEffort[];
  heartRateZones: HeartRateZoneBucket[];
}

// Prepare data for the chart
const prepareChartData = (activities: StravaActivity[]): ChartDataPoint[] => {
  return [...activities].reverse().map(activity => ({
    date: formatShortDate(activity.start_date_local),
    fullDate: new Date(activity.start_date_local).toLocaleDateString('en-US', {
      weekday: 'short', month: 'short', day: 'numeric'
    }),
    distance: parseFloat((activity.distance / 1000).toFixed(2)),
    hr: activity.average_heartrate ? Math.round(activity.average_heartrate) : null,
    pace: formatPace(activity.average_speed),
    name: activity.name,
    isTreadmill: activity.trainer || false,
  }));
};

// Custom Tooltip for the chart
const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 shadow-xl">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-white font-semibold">{data.name}</p>
          {data.isTreadmill && <span className="text-xs bg-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded">🏠 Treadmill</span>}
        </div>
        <p className="text-slate-400 text-sm mb-2">{data.fullDate}</p>
        <div className="space-y-1 text-sm">
          <p className="text-indigo-400">Distance: {data.distance} km</p>
          <p className="text-emerald-400">Pace: {data.pace}/km</p>
          {data.hr && <p className="text-rose-400">Avg HR: {data.hr} bpm</p>}
        </div>
      </div>
    );
  }
  return null;
};

type PromptMode = 'setup' | 'daily';

export default function DashboardClient({ 
  activities, 
  athleteStats,
  bestEfforts: initialBestEfforts,
  heartRateZones: initialHeartRateZones 
}: DashboardClientProps) {
  const [copied, setCopied] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [isLoaded, setIsLoaded] = useState(false);
  const [promptMode, setPromptMode] = useState<PromptMode>('daily');
  const [rpe, setRpe] = useState(5); // Rate of Perceived Exertion (1-10)
  const [isFirstTimeUser, setIsFirstTimeUser] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedActivityIndex, setSelectedActivityIndex] = useState(0); // Which activity to analyze
  const [loadingDetail, setLoadingDetail] = useState(false); // Loading detailed data

  // Enriched activities: local copy with detailed data merged in on demand
  const [enrichedActivities, setEnrichedActivities] = useState<StravaActivity[]>(activities);
  // Per-activity zones and best efforts (keyed by activity id)
  const [zonesMap, setZonesMap] = useState<Map<number, HeartRateZoneBucket[]>>(() => {
    const map = new Map<number, HeartRateZoneBucket[]>();
    if (activities.length > 0 && activities[0].id) {
      map.set(activities[0].id, initialHeartRateZones);
    }
    return map;
  });
  const [bestEffortsMap, setBestEffortsMap] = useState<Map<number, BestEffort[]>>(() => {
    const map = new Map<number, BestEffort[]>();
    if (activities.length > 0 && activities[0].id) {
      map.set(activities[0].id, initialBestEfforts);
    }
    return map;
  });
  const [weatherMap, setWeatherMap] = useState<Map<number, WeatherData | null>>(new Map());

  // Filter valid runs first
  const validRuns = useMemo(() => filterValidRuns(enrichedActivities), [enrichedActivities]);
  
  // Get selected activity and history (all other activities for context)
  const currentRun = validRuns[selectedActivityIndex] || validRuns[0];
  const history = useMemo(() => {
    return validRuns.filter((_, index) => index !== selectedActivityIndex);
  }, [validRuns, selectedActivityIndex]);

  // Get zones and bestEfforts for the currently selected activity
  const heartRateZones = useMemo(() => {
    if (!currentRun?.id) return initialHeartRateZones;
    return zonesMap.get(currentRun.id) || [];
  }, [currentRun, zonesMap, initialHeartRateZones]);

  const bestEfforts = useMemo(() => {
    if (!currentRun?.id) return initialBestEfforts;
    return bestEffortsMap.get(currentRun.id) || [];
  }, [currentRun, bestEffortsMap, initialBestEfforts]);

  const weather = useMemo(() => {
    if (!currentRun?.id) return null;
    return weatherMap.get(currentRun.id) || null;
  }, [currentRun, weatherMap]);

  // Aggregate best efforts across ALL activities for accurate VDOT calculation
  const allTimeBestEfforts = useMemo(() => {
    const effortsByName = new Map<string, BestEffort>();
    bestEffortsMap.forEach(efforts => {
      efforts.forEach(effort => {
        if (effort.distance >= 1500) { // Only meaningful distances
          const existing = effortsByName.get(effort.name);
          if (!existing || effort.elapsed_time < existing.elapsed_time) {
            effortsByName.set(effort.name, effort);
          }
        }
      });
    });
    return Array.from(effortsByName.values());
  }, [bestEffortsMap]);

  // Fetch detailed data for selected activity if not already enriched
  const fetchActivityDetail = useCallback(async (activity: StravaActivity, activityIndex: number) => {
    // Check local cache first
    const cachedData = getCachedActivityDetail(activity.id);
    const hasDetailedData = activity.splits_metric && activity.splits_metric.length > 0;
    const hasWeatherInCache = cachedData && cachedData.weather !== undefined;

    if (hasDetailedData && (hasWeatherInCache || activity.trainer)) return; // Skip if fully enriched
    if (!activity.id) return;

    if (cachedData && hasWeatherInCache) {
      if (cachedData.detailed) {
        setEnrichedActivities(prev => {
          const updated = [...prev];
          const fullIndex = updated.findIndex(a => a.id === activity.id);
          if (fullIndex >= 0) {
            updated[fullIndex] = { ...updated[fullIndex], ...cachedData.detailed };
          }
          return updated;
        });
      }
      if (cachedData.heartRateZones?.length > 0) {
        setZonesMap(prev => new Map(prev).set(activity.id, cachedData.heartRateZones));
      }
      if (cachedData.bestEfforts?.length > 0) {
        setBestEffortsMap(prev => new Map(prev).set(activity.id, cachedData.bestEfforts));
      }
      if (cachedData.weather) {
        setWeatherMap(prev => new Map(prev).set(activity.id, cachedData.weather!));
      }
      return; // Fast exit, used cache
    }

    setLoadingDetail(true);
    try {
      // Fetch Strava data if not already fetched
      let detailed = cachedData?.detailed || null;
      let hrZones = cachedData?.heartRateZones || [];
      let efforts = cachedData?.bestEfforts || [];

      if (!hasDetailedData) {
        const res = await fetch(`/api/strava/activity/${activity.id}`);
        if (!res.ok) {
          console.error("[Enrich] Failed to fetch detail for activity", activity.id);
        } else {
          const data = await res.json();
          detailed = data.detailed || null;
          hrZones = data.heartRateZones || [];
          efforts = data.bestEfforts || [];

          if (detailed) {
            setEnrichedActivities(prev => {
              const updated = [...prev];
              const fullIndex = updated.findIndex(a => a.id === activity.id);
              if (fullIndex >= 0) {
                updated[fullIndex] = { ...updated[fullIndex], ...detailed };
              }
              return updated;
            });
          }
          if (hrZones.length > 0) {
            setZonesMap(prev => new Map(prev).set(activity.id, hrZones));
          }
          if (efforts.length > 0) {
            setBestEffortsMap(prev => new Map(prev).set(activity.id, efforts));
          }
        }
      }

      // Fetch Weather if missing
      let newWeather: WeatherData | null = cachedData?.weather || null;
      const combinedActivity = { ...activity, ...detailed };
      
      if (!newWeather && !combinedActivity.trainer && combinedActivity.start_latlng) {
        const [lat, lng] = combinedActivity.start_latlng;
        newWeather = await getHistoricalWeather(lat, lng, combinedActivity.start_date_local);
        if (newWeather) {
          setWeatherMap(prev => new Map(prev).set(activity.id, newWeather!));
        }
      }

      // Save to cache for next time
      setCachedActivityDetail(
        activity.id, 
        detailed || {}, 
        hrZones || [], 
        efforts || [],
        newWeather
      );

    } catch (err) {
      console.error("[Enrich] Error fetching activity detail/weather:", err);
    } finally {
      setLoadingDetail(false);
    }
  }, []);

  // When user selects a different activity, fetch its detailed data
  useEffect(() => {
    if (currentRun && currentRun.id) {
      fetchActivityDetail(currentRun, selectedActivityIndex);
    }
  }, [selectedActivityIndex, currentRun, fetchActivityDetail]);

  // Background fetch: get best efforts for ALL activities (for accurate VDOT)
  useEffect(() => {
    const fetchAllBestEfforts = async () => {
      // Find activities we don't have best efforts for yet
      const missingIds = validRuns
        .filter(a => a.id && !bestEffortsMap.has(a.id))
        .map(a => a.id);

      if (missingIds.length === 0) return;

      // Check cache first for any we might have stored
      const stillMissing: number[] = [];
      missingIds.forEach(id => {
        const cached = getCachedActivityDetail(id);
        if (cached && cached.bestEfforts?.length > 0) {
          setBestEffortsMap(prev => new Map(prev).set(id, cached.bestEfforts));
        } else {
          stillMissing.push(id);
        }
      });

      if (stillMissing.length === 0) return;

      try {
        const res = await fetch(`/api/strava/best-efforts?ids=${stillMissing.join(',')}`);
        if (res.ok) {
          const data: Record<string, any[]> = await res.json();
          setBestEffortsMap(prev => {
            const updated = new Map(prev);
            Object.entries(data).forEach(([id, efforts]) => {
              if (efforts.length > 0) {
                updated.set(Number(id), efforts);
              }
            });
            return updated;
          });
        }
      } catch (err) {
        console.error("[VDOT] Error fetching best efforts for all activities:", err);
      }
    };

    fetchAllBestEfforts();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [validRuns.length]); // Only re-run when activity count changes

  // Prepare chart data
  const chartData = useMemo(() => prepareChartData(validRuns), [validRuns]);

  // Get key PRs
  const keyPRs = useMemo(() => getKeyPRs(bestEfforts), [bestEfforts]);

  // Calculate total zone time
  const totalZoneTime = useMemo(() => 
    heartRateZones.reduce((sum, z) => sum + z.time, 0), 
    [heartRateZones]
  );

  // Load profile from localStorage on mount
  useEffect(() => {
    const hasProfile = hasStoredProfile();
    
    if (!hasProfile) {
      setIsFirstTimeUser(true);
      setIsSettingsOpen(true);
      setUserProfile(DEFAULT_PROFILE);
    } else {
      const storedProfile = loadProfileFromStorage();
      setUserProfile(storedProfile);
    }
    
    setIsLoaded(true);
  }, []);

  // Handle RPE persistence per activity
  useEffect(() => {
    if (currentRun?.id && typeof window !== "undefined") {
      const savedRpe = localStorage.getItem(`runprompt_rpe_${currentRun.id}`);
      if (savedRpe) {
        setRpe(parseInt(savedRpe, 10));
      } else {
        setRpe(5); // default
      }
    }
  }, [currentRun?.id]);

  const handleRpeChange = (newRpe: number) => {
    setRpe(newRpe);
    if (currentRun?.id && typeof window !== "undefined") {
      localStorage.setItem(`runprompt_rpe_${currentRun.id}`, newRpe.toString());
    }
  };

  // Generate prompts dynamically based on mode, RPE, and current data
  const systemPrompt = useMemo(() => {
    if (!currentRun) return "";
    return generateSystemPrompt(currentRun, history, userProfile, heartRateZones, bestEfforts, rpe, weather, allTimeBestEfforts);
  }, [currentRun, history, userProfile, heartRateZones, bestEfforts, rpe, weather, allTimeBestEfforts]);

  const updatePrompt = useMemo(() => {
    if (!currentRun) return "";
    return generateUpdatePrompt(currentRun, history, userProfile, heartRateZones, bestEfforts, rpe, weather, allTimeBestEfforts);
  }, [currentRun, history, userProfile, heartRateZones, bestEfforts, rpe, weather, allTimeBestEfforts]);

  // Get the active prompt based on mode
  const activePrompt = promptMode === 'setup' ? systemPrompt : updatePrompt;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(activePrompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleProfileSave = (newProfile: UserProfile) => {
    setUserProfile(newProfile);
    setIsFirstTimeUser(false);
  };

  // Calculate training load for display
  const load = useMemo(() => calculateTrainingLoad(validRuns), [validRuns]);

  if (!isLoaded) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-slate-400">Loading...</div>
      </div>
    );
  }

  if (!currentRun) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-950 text-white">
        <h2 className="text-xl">No valid running activities found.</h2>
      </div>
    );
  }

  // Safe formatting of dates
  const formattedDate = new Date(currentRun.start_date_local).toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });

  // Calculate Pace (min/km)
  const paceMin = Math.floor(1000 / currentRun.average_speed / 60);
  const paceSec = Math.floor((1000 / currentRun.average_speed) % 60);
  const formattedPace = `${paceMin}:${paceSec.toString().padStart(2, '0')} /km`;

  // Calculate Duration
  const hours = Math.floor(currentRun.moving_time / 3600);
  const minutes = Math.floor((currentRun.moving_time % 3600) / 60);
  const seconds = currentRun.moving_time % 60;
  const formattedTime = `${hours > 0 ? hours + 'h ' : ''}${minutes}m ${seconds}s`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-12">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              {selectedActivityIndex === 0 ? 'Your Latest Run' : 'Activity History'}
            </h1>
            <p className="text-slate-400">
              {selectedActivityIndex === 0 ? (
                <>
                  AI analysis with {validRuns.length} valid sessions 
                  {activities.length !== validRuns.length && (
                    <span className="text-slate-500"> ({activities.length - validRuns.length} filtered out)</span>
                  )}
                </>
              ) : (
                <>
                  Viewing activity from{' '}
                  <span className="text-indigo-400">
                    {new Date(currentRun.start_date_local).toLocaleDateString('en-US', { 
                      month: 'long', 
                      day: 'numeric' 
                    })}
                  </span>
                  {' '}• <button 
                    onClick={() => setSelectedActivityIndex(0)} 
                    className="text-purple-400 hover:text-purple-300 underline underline-offset-2"
                  >
                    Back to latest
                  </button>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ProTipsDialog />
            <SettingsDialog 
              profile={userProfile} 
              onSave={handleProfileSave}
              isOpen={isSettingsOpen}
              onOpenChange={setIsSettingsOpen}
              isFirstTimeUser={isFirstTimeUser}
            />
          </div>
        </div>

        {/* Activity History Selector */}
        {validRuns.length > 1 && (
          <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg text-white">
                <History className="w-5 h-5 text-indigo-400" />
                Select Activity to Analyze
                <span className="text-sm font-normal text-slate-400 ml-2">
                  ({validRuns.length} available)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="relative">
                {/* Scroll hint gradients */}
                <div className="absolute left-0 top-0 bottom-0 w-8 bg-gradient-to-r from-slate-900/80 to-transparent z-10 pointer-events-none" />
                <div className="absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-slate-900/80 to-transparent z-10 pointer-events-none" />
                
                {/* Scrollable activity list */}
                <div className="flex gap-3 overflow-x-auto pb-2 px-1 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                  {validRuns.map((activity, index) => {
                    const activityDate = new Date(activity.start_date_local);
                    const isSelected = index === selectedActivityIndex;
                    const distanceKm = (activity.distance / 1000).toFixed(1);
                    const pace = formatPace(activity.average_speed);
                    
                    return (
                      <button
                        key={activity.id || activity.start_date_local + index}
                        onClick={() => setSelectedActivityIndex(index)}
                        className={`flex-shrink-0 p-3 rounded-lg border transition-all duration-200 text-left min-w-[160px] ${
                          isSelected
                            ? 'bg-indigo-600/30 border-indigo-500 shadow-lg shadow-indigo-500/20'
                            : 'bg-slate-800/50 border-slate-700/50 hover:bg-slate-800 hover:border-slate-600'
                        }`}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          {index === 0 && (
                            <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded font-medium">
                              LATEST
                            </span>
                          )}
                          {activity.trainer && (
                            <span className="text-[10px]">🏠</span>
                          )}
                        </div>
                        <p className={`font-medium text-sm truncate ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                          {activity.name}
                        </p>
                        <p className="text-xs text-slate-400 mt-1">
                          {activityDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </p>
                        <div className="flex items-center gap-2 mt-2 text-xs">
                          <span className={isSelected ? 'text-indigo-300' : 'text-slate-400'}>
                            {distanceKm} km
                          </span>
                          <span className="text-slate-600">•</span>
                          <span className={isSelected ? 'text-indigo-300' : 'text-slate-400'}>
                            {pace}/km
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              
              {/* Navigation hint */}
              {selectedActivityIndex > 0 && (
                <p className="text-xs text-amber-400/70 mt-3 flex items-center gap-1">
                  <Info className="w-3 h-3" />
                  Viewing older activity. Swipe/scroll to see more or select the latest.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Training Load Summary */}
        <Card className="bg-gradient-to-r from-indigo-900/30 to-purple-900/30 border-indigo-800/50 backdrop-blur-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-6 justify-center flex-wrap">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-indigo-400" />
                <span className="text-slate-400 text-sm">Last 7 Days:</span>
                <span className="font-semibold text-white">{load.totalDistanceKm.toFixed(1)} km</span>
              </div>
              <div className="w-px h-6 bg-slate-700 hidden sm:block" />
              <div className="flex items-center gap-2">
                <Clock className="w-5 h-5 text-purple-400" />
                <span className="font-semibold text-white">{load.totalHours.toFixed(1)} hours</span>
              </div>
              <div className="w-px h-6 bg-slate-700 hidden sm:block" />
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-pink-400" />
                <span className="font-semibold text-white">{load.sessionsLast7Days} sessions</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Heart Rate Zones */}
        {heartRateZones.length > 0 && totalZoneTime > 0 && (
          <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg text-white">
                <Heart className="w-5 h-5 text-rose-500" />
                Time in Heart Rate Zones
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {heartRateZones.map((zone, index) => {
                  const percentage = (zone.time / totalZoneTime) * 100;
                  const zoneConfig = ZONE_COLORS[index] || ZONE_COLORS[0];
                  return (
                    <div key={index} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className={zoneConfig.text}>{zoneConfig.label}</span>
                        <span className="text-slate-400">
                          {formatDurationLong(zone.time)} ({percentage.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                        <div 
                          className={`h-full ${zoneConfig.bg} rounded-full transition-all duration-500`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Personal Records */}
        {keyPRs.length > 0 && (
          <Card className="bg-gradient-to-r from-amber-900/20 to-orange-900/20 border-amber-800/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg text-white">
                <Trophy className="w-5 h-5 text-amber-500" />
                Best Efforts This Run
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {keyPRs.map((pr, index) => (
                  <div 
                    key={index} 
                    className={`p-3 rounded-lg border ${
                      pr.isPR 
                        ? 'bg-amber-500/20 border-amber-500/50' 
                        : 'bg-slate-800/50 border-slate-700/50'
                    }`}
                  >
                    <div className="flex items-center gap-1 mb-1">
                      <span className="text-sm font-medium text-white">{pr.name}</span>
                      {pr.isPR && <Zap className="w-4 h-4 text-amber-400" />}
                    </div>
                    <div className="text-lg font-bold text-white">{pr.time}</div>
                    <div className="text-xs text-slate-400">{pr.date}</div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Training Trends Chart */}
        {chartData.length > 1 && (
          <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg text-white">
                <BarChart3 className="w-5 h-5 text-indigo-400" />
                Training Trends
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis 
                      dataKey="date" 
                      tick={{ fill: '#94a3b8', fontSize: 12 }}
                      axisLine={{ stroke: '#475569' }}
                    />
                    <YAxis 
                      yAxisId="left"
                      tick={{ fill: '#94a3b8', fontSize: 12 }}
                      axisLine={{ stroke: '#475569' }}
                      label={{ value: 'km', angle: -90, position: 'insideLeft', fill: '#94a3b8', fontSize: 12 }}
                    />
                    <YAxis 
                      yAxisId="right" 
                      orientation="right"
                      domain={['dataMin - 10', 'dataMax + 10']}
                      tick={{ fill: '#94a3b8', fontSize: 12 }}
                      axisLine={{ stroke: '#475569' }}
                      label={{ value: 'bpm', angle: 90, position: 'insideRight', fill: '#94a3b8', fontSize: 12 }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend 
                      wrapperStyle={{ paddingTop: '10px' }}
                      formatter={(value) => <span className="text-slate-300 text-sm">{value}</span>}
                    />
                    <Bar 
                      yAxisId="left"
                      dataKey="distance" 
                      name="Distance (km)"
                      fill="#6366f1" 
                      radius={[4, 4, 0, 0]}
                      opacity={0.8}
                    />
                    <Line 
                      yAxisId="right"
                      type="monotone" 
                      dataKey="hr" 
                      name="Avg HR (bpm)"
                      stroke="#f43f5e" 
                      strokeWidth={2}
                      dot={{ fill: '#f43f5e', strokeWidth: 2, r: 4 }}
                      connectNulls
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Stats Grid */}
        <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl text-white">
              <Activity className="text-orange-500" />
              {currentRun.name}
              {currentRun.trainer && (
                <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-1 rounded-full font-normal">
                  🏠 Treadmill
                </span>
              )}
              {!currentRun.trainer && (
                <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-1 rounded-full font-normal">
                  🌳 Outdoor
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-6">
            <div className="space-y-1 bg-slate-800/50 p-4 rounded-lg border border-slate-700/50">
              <div className="flex items-center gap-2 text-slate-400 text-sm"><Calendar className="w-4 h-4" /> Date</div>
              <div className="font-semibold text-lg text-white">{formattedDate}</div>
            </div>
            <div className="space-y-1 bg-slate-800/50 p-4 rounded-lg border border-slate-700/50">
              <div className="flex items-center gap-2 text-slate-400 text-sm"><MapPin className="w-4 h-4" /> Distance</div>
              <div className="font-semibold text-lg text-white">{(currentRun.distance / 1000).toFixed(2)} km</div>
            </div>
            <div className="space-y-1 bg-slate-800/50 p-4 rounded-lg border border-slate-700/50">
              <div className="flex items-center gap-2 text-slate-400 text-sm"><Timer className="w-4 h-4" /> Pace</div>
              <div className="font-semibold text-lg text-white">{formattedPace}</div>
            </div>
            <div className="space-y-1 bg-slate-800/50 p-4 rounded-lg border border-slate-700/50">
              <div className="flex items-center gap-2 text-slate-400 text-sm"><Clock className="w-4 h-4" /> Duration</div>
              <div className="font-semibold text-lg text-white">{formattedTime}</div>
            </div>
          </CardContent>
        </Card>

        {/* AI Prompt Section */}
        <Card className="bg-slate-900/50 border-slate-800 shadow-2xl shadow-purple-900/10">
          <CardHeader className="space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <CardTitle className="text-white flex items-center gap-2">
                AI Coaching Prompt
                {loadingDetail && (
                  <span className="text-xs font-normal text-indigo-400 animate-pulse">
                    Loading detailed data...
                  </span>
                )}
              </CardTitle>
              <div className="flex flex-wrap gap-2">
                <Button 
                  onClick={handleCopy}
                  className={`transition-all duration-300 ${copied ? 'bg-green-600 hover:bg-green-700' : 'bg-purple-600 hover:bg-purple-700'}`}
                >
                  {copied ? <><Check className="w-4 h-4 mr-2" /> Copied!</> : <><Copy className="w-4 h-4 mr-2" /> Copy Prompt</>}
                </Button>
                {copied && (
                  <div className="flex gap-2 ml-2 animate-in fade-in zoom-in duration-300">
                    <Button variant="outline" size="icon" className="bg-[#10a37f] hover:bg-[#10a37f]/90 border-0" onClick={() => window.open('https://chatgpt.com', '_blank')}>
                      <svg viewBox="0 0 24 24" className="w-4 h-4 text-white" fill="currentColor"><path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.073zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.8956zm16.0993 3.8558L12.5973 8.3829a.7664.7664 0 0 0-.7806 0L5.974 11.7514v-2.3324a.0757.0757 0 0 1 .0332-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66v5.5958l-.142-.0853-4.7783-2.7582a.7948.7948 0 0 0-.3927-.6813z"/></svg>
                    </Button>
                    <Button variant="outline" size="icon" className="bg-[#D97757] hover:bg-[#D97757]/90 border-0" onClick={() => window.open('https://claude.ai/new', '_blank')}>
                      <span className="text-white font-serif font-bold text-lg">C</span>
                    </Button>
                    <Button variant="outline" size="icon" className="bg-[#4285F4] hover:bg-[#4285F4]/90 border-0" onClick={() => window.open('https://gemini.google.com/app', '_blank')}>
                      <svg viewBox="0 0 24 24" className="w-4 h-4 text-white" fill="currentColor"><path d="M12 24c-1.33 0-2.4-.44-3.19-1.32-.79-.88-1.19-2.04-1.19-3.48V16h-3.6c-1.44 0-2.6-.4-3.48-1.2C-.34 14.01-.73 12.85-.73 11.41c0-1.44.39-2.6 1.18-3.48.79-.88 1.95-1.32 3.49-1.32h3.6V3.01c0-1.44.4-2.6 1.19-3.48.8-.88 1.86-1.32 3.19-1.32 1.33 0 2.4.44 3.19 1.32.79.88 1.19 2.04 1.19 3.48v3.6h3.6c1.44 0 2.6.44 3.48 1.32.88.88 1.32 2.04 1.32 3.48 0 1.44-.44 2.6-1.32 3.48-.88.88-2.04 1.2-3.48 1.2h-3.6v3.2c0 1.44-.4 2.6-1.19 3.48-.79.88-1.86 1.32-3.19 1.32z"/></svg>
                    </Button>
                  </div>
                )}
              </div>
            </div>
            
            {/* Mode Toggle Tabs */}
            <div className="flex gap-2">
              <button
                onClick={() => setPromptMode('setup')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  promptMode === 'setup'
                    ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/25'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-300'
                }`}
              >
                <Sparkles className="w-4 h-4" />
                Start New Chat
              </button>
              <button
                onClick={() => setPromptMode('daily')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  promptMode === 'daily'
                    ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/25'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-300'
                }`}
              >
                <RefreshCw className="w-4 h-4" />
                Daily Update
              </button>
            </div>

            {/* Info Box */}
            <div className="flex items-start gap-3 p-3 bg-slate-800/50 rounded-lg border border-slate-700/50">
              <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-slate-400">
                {promptMode === 'setup' ? (
                  <>
                    <span className="text-blue-400 font-medium">Start New Chat:</span> Use this ONCE to initialize your AI Coach with your full profile, training philosophy, and baseline data. This creates your coaching relationship.
                  </>
                ) : (
                  <>
                    <span className="text-indigo-400 font-medium">Daily Update:</span> Paste this into your EXISTING chat thread to add new sessions. The AI will remember your profile and track trends over time. This optimizes token usage for long-term coaching.
                  </>
                )}
              </div>
            </div>

            {/* RPE Slider */}
            <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700/50">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Gauge className="w-5 h-5 text-orange-400" />
                  <span className="text-white font-medium">Rate of Perceived Exertion (RPE)</span>
                </div>
                <div className={`text-lg font-bold ${RPE_LABELS[rpe]?.color || 'text-white'}`}>
                  {rpe}/10 - {RPE_LABELS[rpe]?.label || 'Moderate'}
                </div>
              </div>
              <div className="relative">
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={rpe}
                  onChange={(e) => handleRpeChange(parseInt(e.target.value))}
                  className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
                  style={{
                    background: `linear-gradient(to right, 
                      #6b7280 0%, 
                      #3b82f6 30%, 
                      #22c55e 50%, 
                      #eab308 70%, 
                      #ef4444 100%)`
                  }}
                />
                <div className="flex justify-between text-xs text-slate-500 mt-1">
                  <span>1 - Very Light</span>
                  <span>5 - Moderate</span>
                  <span>10 - Max</span>
                </div>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                💡 How hard did this session FEEL? This subjective input helps the AI understand internal load vs. external metrics.
              </p>
            </div>
          </CardHeader>
          <CardContent>
            <Textarea 
              readOnly 
              value={activePrompt} 
              className="min-h-[400px] bg-slate-950 border-slate-700 font-mono text-sm text-slate-300 resize-none focus-visible:ring-purple-500"
            />
            <p className="text-xs text-slate-500 mt-2 text-right">
              {promptMode === 'setup' ? '~Full system prompt' : '~Lightweight update'} • {activePrompt.length.toLocaleString()} characters
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
