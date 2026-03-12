"use client";

import { useState, useEffect, useMemo } from "react";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SettingsDialog } from "@/components/settings-dialog";
import { RunwiseUserProfile } from "@/types/runwise";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  ChevronUp,
  Award,
  Gauge,
  Timer,
  Zap,
  Mountain,
  Thermometer,
  Activity,
  CheckCircle2,
  XCircle,
  Info,
} from "lucide-react";
import { StravaActivity } from "@/types/strava";
import { WeatherData, getHistoricalWeather } from "@/lib/weather";
import {
  computeDynamicVDOT,
  type DynamicVDOTResult,
  type VDOTActivityResult,
} from "@/lib/vdot-calculator";
import { filterValidRuns } from "@/lib/metrics";

interface VDOTClientProps {
  activities: StravaActivity[];
  maxHR: number;
  restingHR: number;
  profile: RunwiseUserProfile | null;
}

// ─── Custom Tooltip for VDOT trend chart ──────────────────────
type VDOTTrendPoint = {
  label: string;
  vdot: number;
};

type VDOTTooltipProps = {
  active?: boolean;
  payload?: Array<{ payload: VDOTTrendPoint }>;
};

const VDOTTooltip = ({ active, payload }: VDOTTooltipProps) => {
  if (!active || !payload?.length) return null;
  const data = payload[0].payload;
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-3 shadow-lg">
      <p className="text-slate-300 text-xs">{data.label}</p>
      <p className="text-orange-400 font-bold text-lg">{data.vdot}</p>
    </div>
  );
};

// ─── Confidence badge ────────────────────────────────────────
function ConfidenceBadge({ confidence }: { confidence: "high" | "medium" | "low" }) {
  const config = {
    high: { label: "Høy", bg: "bg-emerald-500/20", text: "text-emerald-400", border: "border-emerald-500/30" },
    medium: { label: "Moderat", bg: "bg-amber-500/20", text: "text-amber-400", border: "border-amber-500/30" },
    low: { label: "Lav", bg: "bg-red-500/20", text: "text-red-400", border: "border-red-500/30" },
  };
  const c = config[confidence];
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${c.bg} ${c.text} border ${c.border}`}>
      <Activity className="w-3 h-3" />
      {c.label} sikkerhet
    </span>
  );
}

// ─── Correction badges ───────────────────────────────────────
function CorrectionBadges({ result }: { result: VDOTActivityResult }) {
  return (
    <div className="flex flex-wrap gap-1">
      {result.corrections.gapApplied && (
        <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/20">
          <Mountain className="w-2.5 h-2.5" /> GAP
        </span>
      )}
      {result.corrections.weatherCorrectionPct > 0 && (
        <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/20">
          <Thermometer className="w-2.5 h-2.5" /> +{result.corrections.weatherCorrectionPct}%
        </span>
      )}
      {result.corrections.isTreadmill && (
        <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/20">
          +3% mølle
        </span>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
//  MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════

export function VDOTClient({ activities, maxHR: initialMaxHR, restingHR: initialRestingHR, profile: initialProfile }: VDOTClientProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profile, setProfile] = useState(initialProfile);
  // Allow profile updates to refresh maxHR/restingHR in real-time
  const maxHR = profile?.maxHR ?? initialMaxHR;
  const restingHR = profile?.restingHR ?? initialRestingHR;

  const [weatherMap, setWeatherMap] = useState<Map<number, WeatherData | null>>(new Map());
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [detailedActivities, setDetailedActivities] = useState<Map<number, StravaActivity>>(new Map());
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [showMethodology, setShowMethodology] = useState(false);
  const [showAllActivities, setShowAllActivities] = useState(false);

  const validRuns = useMemo(() => filterValidRuns(activities), [activities]);

  // ─── Fetch detailed activity data (splits, laps, GAP) ──────
  useEffect(() => {
    let cancelled = false;

    if (validRuns.length === 0) {
      return () => {
        cancelled = true;
      };
    }

    async function fetchDetails() {
      setDetailsLoading(true);
      const newMap = new Map<number, StravaActivity>();
      const batchSize = 5;

      for (let i = 0; i < validRuns.length; i += batchSize) {
        if (cancelled) break;
        const batch = validRuns.slice(i, i + batchSize);

        await Promise.all(
          batch.map(async (activity) => {
            try {
              const res = await fetch(`/api/strava/activity/${activity.id}`);
              if (res.ok) {
                const data = await res.json();
                if (data.detailed) {
                  newMap.set(activity.id, { ...activity, ...data.detailed });
                }
              }
            } catch {
              // Use base activity data
            }
          })
        );

        if (!cancelled) {
          setDetailedActivities(new Map(newMap));
        }

        // Small delay to avoid rate limiting
        if (i + batchSize < validRuns.length) {
          await new Promise((r) => setTimeout(r, 200));
        }
      }

      if (!cancelled) setDetailsLoading(false);
    }

    fetchDetails();

    return () => { cancelled = true; };
  }, [validRuns]);

  // ─── Fetch weather data for outdoor activities ─────────────
  useEffect(() => {
    let cancelled = false;

    if (validRuns.length === 0) {
      return () => {
        cancelled = true;
      };
    }

    async function fetchWeather() {
      setWeatherLoading(true);
      const wMap = new Map<number, WeatherData | null>();
      const outdoorRuns = validRuns.filter(
        (a) => !a.trainer && a.start_latlng && a.start_latlng.length === 2
      );

      const batchSize = 3;
      for (let i = 0; i < outdoorRuns.length; i += batchSize) {
        if (cancelled) break;
        const batch = outdoorRuns.slice(i, i + batchSize);

        await Promise.all(
          batch.map(async (activity) => {
            try {
              const [lat, lng] = activity.start_latlng!;
              const weather = await getHistoricalWeather(lat, lng, activity.start_date_local);
              wMap.set(activity.id, weather);
            } catch {
              wMap.set(activity.id, null);
            }
          })
        );

        if (!cancelled) setWeatherMap(new Map(wMap));
        if (i + batchSize < outdoorRuns.length) {
          await new Promise((r) => setTimeout(r, 300));
        }
      }

      if (!cancelled) setWeatherLoading(false);
    }

    fetchWeather();

    return () => { cancelled = true; };
  }, [validRuns]);

  // ─── Compute VDOT with all available data ──────────────────
  const vdotResult: DynamicVDOTResult | null = useMemo(() => {
    if (validRuns.length === 0 || maxHR <= 0) return null;

    // Merge detailed data with base activities
    const enrichedActivities = validRuns.map((a) => detailedActivities.get(a.id) ?? a);

    return computeDynamicVDOT(enrichedActivities, maxHR, restingHR, weatherMap);
  }, [validRuns, maxHR, restingHR, weatherMap, detailedActivities]);

  // ─── Trend direction ───────────────────────────────────────
  const trendDirection = useMemo(() => {
    if (!vdotResult || vdotResult.vdotTrend.length < 3) return "stable";
    const trend = vdotResult.vdotTrend;
    const recent = trend.slice(-3);
    const older = trend.slice(0, Math.max(1, trend.length - 3));
    const recentAvg = recent.reduce((s, t) => s + t.vdot, 0) / recent.length;
    const olderAvg = older.reduce((s, t) => s + t.vdot, 0) / older.length;
    const diff = recentAvg - olderAvg;
    if (diff > 0.5) return "up";
    if (diff < -0.5) return "down";
    return "stable";
  }, [vdotResult]);

  const isLoading = detailsLoading || weatherLoading;

  // ─── No data state ─────────────────────────────────────────
  if (validRuns.length === 0) {
    return (
      <div className="min-h-screen bg-slate-950">
        <AppHeader onSettingsClick={() => setSettingsOpen(true)} />
        {profile && (
          <SettingsDialog isOpen={settingsOpen} onOpenChange={setSettingsOpen} initialProfile={profile} onSaved={setProfile} />
        )}
        <main className="max-w-2xl mx-auto px-4 py-12">
          <div className="text-center space-y-4">
            <Gauge className="w-16 h-16 text-slate-600 mx-auto" />
            <h2 className="text-xl font-bold text-white">Ingen løpeaktiviteter</h2>
            <p className="text-slate-400 text-sm max-w-md mx-auto">
              VDOT-kalkulatoren trenger løpeaktiviteter fra de siste 90 dagene.
              Koble til Strava og logg noen løpeturer.
            </p>
          </div>
        </main>
      </div>
    );
  }

  // ─── No maxHR state ────────────────────────────────────────
  if (maxHR <= 0) {
    return (
      <div className="min-h-screen bg-slate-950">
        <AppHeader onSettingsClick={() => setSettingsOpen(true)} />
        {profile && (
          <SettingsDialog isOpen={settingsOpen} onOpenChange={setSettingsOpen} initialProfile={profile} onSaved={setProfile} />
        )}
        <main className="max-w-2xl mx-auto px-4 py-12">
          <div className="text-center space-y-4">
            <Activity className="w-16 h-16 text-slate-600 mx-auto" />
            <h2 className="text-xl font-bold text-white">Maks puls mangler</h2>
            <p className="text-slate-400 text-sm max-w-md mx-auto">
              For å beregne VDOT trenger vi din maks hjertefrekvens.
              Importer fra Strava eller legg inn manuelt i innstillinger.
            </p>
            <Button
              onClick={() => setSettingsOpen(true)}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              Åpne innstillinger
            </Button>
          </div>
        </main>
      </div>
    );
  }

  const displayedActivities = showAllActivities
    ? vdotResult?.perActivityResults ?? []
    : (vdotResult?.perActivityResults ?? []).slice(0, 10);

  return (
    <div className="min-h-screen bg-slate-950">
      <AppHeader onSettingsClick={() => setSettingsOpen(true)} />
      {profile && (
        <SettingsDialog
          isOpen={settingsOpen}
          onOpenChange={setSettingsOpen}
          initialProfile={profile}
          onSaved={setProfile}
        />
      )}

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-5">
        {/* ── HERO: Dynamic VDOT Score ──────────────────────── */}
        <Card className="bg-gradient-to-br from-slate-900 via-slate-900 to-orange-950/30 border-slate-800">
          <CardContent className="py-6 px-5">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-500 uppercase tracking-wider font-medium mb-1">
                  Din dynamiske VDOT
                </p>
                <div className="flex items-baseline gap-3">
                  <span className="text-5xl font-black text-white tabular-nums">
                    {vdotResult?.currentVdot ?? "—"}
                  </span>
                  <div className="flex items-center gap-1">
                    {trendDirection === "up" && <TrendingUp className="w-5 h-5 text-emerald-400" />}
                    {trendDirection === "down" && <TrendingDown className="w-5 h-5 text-red-400" />}
                    {trendDirection === "stable" && <Minus className="w-5 h-5 text-slate-500" />}
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  {vdotResult && <ConfidenceBadge confidence={vdotResult.confidence} />}
                  <span className="text-xs text-slate-500">
                    {vdotResult?.dataPointCount ?? 0} kvalifiserte aktiviteter
                  </span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Gauge className="w-10 h-10 text-orange-500/60" />
                {isLoading && (
                  <span className="text-[10px] text-slate-500 flex items-center gap-1">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    Oppdaterer...
                  </span>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── VDOT TREND CHART ────────────────────────────── */}
        {vdotResult && vdotResult.vdotTrend.length >= 2 && (
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="pb-2 px-5 pt-4">
              <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-orange-400" />
                VDOT-utvikling siste 90 dager
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-4">
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={vdotResult.vdotTrend} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: "#64748b", fontSize: 10 }}
                      axisLine={{ stroke: "#334155" }}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tick={{ fill: "#64748b", fontSize: 10 }}
                      axisLine={{ stroke: "#334155" }}
                      domain={["dataMin - 1", "dataMax + 1"]}
                    />
                    <Tooltip content={<VDOTTooltip />} />
                    <Line
                      type="monotone"
                      dataKey="vdot"
                      stroke="#f97316"
                      strokeWidth={2.5}
                      dot={{ fill: "#f97316", strokeWidth: 0, r: 3 }}
                      activeDot={{ r: 5, fill: "#fb923c", stroke: "#f97316", strokeWidth: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── RACE PREDICTIONS ────────────────────────────── */}
        {vdotResult && vdotResult.racePredictions.length > 0 && (
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="pb-2 px-5 pt-4">
              <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
                <Timer className="w-4 h-4 text-amber-400" />
                Predikerte løpstider
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4">
              <div className="grid grid-cols-3 gap-x-4 gap-y-0.5">
                {/* Header */}
                <span className="text-[10px] text-slate-600 uppercase tracking-wider font-medium">Distanse</span>
                <span className="text-[10px] text-slate-600 uppercase tracking-wider font-medium text-right">Tid</span>
                <span className="text-[10px] text-slate-600 uppercase tracking-wider font-medium text-right">Tempo</span>

                {vdotResult.racePredictions.map((pred) => (
                  <div key={pred.distance} className="contents">
                    <span className="text-sm text-slate-300 py-1.5 border-b border-slate-800/50">{pred.distance}</span>
                    <span className="text-sm text-white font-mono font-medium text-right py-1.5 border-b border-slate-800/50">
                      {pred.predictedTime}
                    </span>
                    <span className="text-xs text-slate-400 text-right py-1.5 border-b border-slate-800/50">
                      {pred.pacePerKm}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── TRAINING ZONES ──────────────────────────────── */}
        {vdotResult && vdotResult.trainingZones.length > 0 && (
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="pb-2 px-5 pt-4">
              <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
                <Zap className="w-4 h-4 text-yellow-400" />
                Treningssoner (Daniels)
              </CardTitle>
            </CardHeader>
            <CardContent className="px-5 pb-4 space-y-2">
              {vdotResult.trainingZones.map((zone) => {
                const colors: Record<string, string> = {
                  "Easy (E)": "from-emerald-500/20 to-emerald-500/5 border-emerald-500/20",
                  "Marathon (M)": "from-blue-500/20 to-blue-500/5 border-blue-500/20",
                  "Threshold (T)": "from-yellow-500/20 to-yellow-500/5 border-yellow-500/20",
                  "Interval (I)": "from-orange-500/20 to-orange-500/5 border-orange-500/20",
                  "Repetition (R)": "from-red-500/20 to-red-500/5 border-red-500/20",
                };
                const colorClass = colors[zone.name] ?? "from-slate-500/20 to-slate-500/5 border-slate-500/20";

                return (
                  <div
                    key={zone.name}
                    className={`bg-gradient-to-r ${colorClass} border rounded-lg px-4 py-3`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-white">{zone.nameNorwegian}</span>
                      <span className="text-[10px] text-slate-400">{zone.pctVdotMin}–{zone.pctVdotMax}% VDOT</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-300 font-mono">{zone.pace}</span>
                      <span className="text-xs text-slate-400">
                        {zone.hrMin}–{zone.hrMax} bpm
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500 mt-1">{zone.purpose}</p>
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        {/* ── PER-ACTIVITY VDOT BREAKDOWN ─────────────────── */}
        {vdotResult && vdotResult.perActivityResults.length > 0 && (
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader className="pb-2 px-5 pt-4">
              <CardTitle className="text-sm text-slate-300 flex items-center gap-2">
                <Award className="w-4 h-4 text-indigo-400" />
                VDOT per aktivitet
              </CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-4">
              <div className="space-y-1">
                {displayedActivities.map((result) => {
                  const dateObj = new Date(result.date);
                  const dateStr = dateObj.toLocaleDateString("no-NO", {
                    day: "numeric",
                    month: "short",
                  });

                  return (
                    <div
                      key={result.activityId}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
                        result.isQualifying
                          ? "bg-slate-800/40"
                          : "bg-slate-800/20 opacity-50"
                      }`}
                    >
                      {/* Status icon */}
                      {result.isQualifying ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                      )}

                      {/* Activity info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-slate-500 shrink-0">{dateStr}</span>
                          <span className="text-sm text-slate-200 truncate">
                            {result.activityName}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] text-slate-500">
                            {result.distanceKm} km · {result.activityType}
                          </span>
                          <CorrectionBadges result={result} />
                        </div>
                      </div>

                      {/* VDOT value + weight */}
                      <div className="text-right shrink-0">
                        {result.finalVdot !== null ? (
                          <>
                            <span className="text-sm font-bold text-white tabular-nums">
                              {result.finalVdot}
                            </span>
                            {result.isQualifying && result.weight > 0 && (
                              <span className="block text-[9px] text-slate-600">
                                vekt {Math.round(result.weight * 100)}%
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-slate-600">—</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Show more / less */}
              {(vdotResult.perActivityResults.length > 10) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAllActivities(!showAllActivities)}
                  className="w-full mt-2 text-xs text-slate-500 hover:text-slate-300"
                >
                  {showAllActivities ? (
                    <>Vis færre <ChevronUp className="w-3 h-3 ml-1" /></>
                  ) : (
                    <>Vis alle {vdotResult.perActivityResults.length} aktiviteter <ChevronDown className="w-3 h-3 ml-1" /></>
                  )}
                </Button>
              )}

              {/* Non-qualifying explanation */}
              {vdotResult.perActivityResults.some((r) => !r.isQualifying) && (
                <p className="text-[10px] text-slate-600 mt-2 px-3 flex items-start gap-1">
                  <Info className="w-3 h-3 shrink-0 mt-0.5" />
                  Halvtone aktiviteter er filtrert (intervaller, for kort varighet, manglende data, eller høy kardiovaskulær drift).
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* ── METHODOLOGY ─────────────────────────────────── */}
        {vdotResult && (
          <Card className="bg-slate-900/50 border-slate-800">
            <button
              type="button"
              onClick={() => setShowMethodology(!showMethodology)}
              className="w-full px-5 py-3 flex items-center justify-between cursor-pointer hover:bg-slate-800/30 transition-colors rounded-xl"
            >
              <span className="text-xs text-slate-500 uppercase tracking-wider font-medium flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5" />
                Metode og korreksjonar
              </span>
              {showMethodology ? (
                <ChevronUp className="w-4 h-4 text-slate-600" />
              ) : (
                <ChevronDown className="w-4 h-4 text-slate-600" />
              )}
            </button>

            {showMethodology && (
              <CardContent className="px-5 pb-4 pt-0">
                <ul className="space-y-1.5">
                  {vdotResult.methodology.map((item, i) => (
                    <li key={i} className="text-xs text-slate-400 flex items-start gap-2">
                      <span className="text-orange-500 mt-0.5">•</span>
                      {item}
                    </li>
                  ))}
                </ul>
                <div className="mt-3 pt-3 border-t border-slate-800/50">
                  <p className="text-[10px] text-slate-600 leading-relaxed">
                    Basert på Jack Daniels VDOT-system med dynamiske korreksjonar for terreng (GAP),
                    vær (temperatur + duggpunkt), og kardiovaskulær drift. Eksponentiell forfallsvekting
                    (halvtid 21 dager) sikrer at ferske data dominerer estimatet.
                  </p>
                </div>
              </CardContent>
            )}
          </Card>
        )}
      </main>
    </div>
  );
}
