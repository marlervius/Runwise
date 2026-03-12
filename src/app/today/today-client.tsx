"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { AppHeader } from "@/components/app-header";
import { WorkoutCard } from "@/components/workout-card";
import { WeekOverview } from "@/components/week-overview";
import { MoodSelector } from "@/components/mood-selector";
import { PostWorkoutFeedback } from "@/components/post-workout-feedback";
import { WorkoutDetailModal } from "@/components/workout-detail-modal";
import { LastWorkoutReview } from "@/components/last-workout-review";
import { WeeklyPlan, WeeklyPlanDay, DailyWorkout, RunwiseUserProfile, WorkoutReview } from "@/types/runwise";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SettingsDialog } from "@/components/settings-dialog";

interface TodayClientProps {
  weekPlan: WeeklyPlan | null;
  todaysWorkout: DailyWorkout | null;
  showTreadmillVariant: boolean;
  completedDates?: string[];
  profile: RunwiseUserProfile | null;
  athleteFirstName?: string | null;
  lastWorkoutReview?: WorkoutReview | null;
}

// ─── Smart uksfokus-fallback (brukes hvis AI ikke har satt weekFocus) ────────
function buildWeekFocus(plan: WeeklyPlan): string {
  const { days, totalVolumeKm, hardDayCount } = plan;
  const activeDays = days.filter(d => d.workoutType !== "rest");
  const longRun = days.find(d => d.workoutType === "long");
  const hasIntervals = days.some(d => d.workoutType === "interval");
  const hasThreshold = days.some(d => d.workoutType === "threshold");

  const volStr = totalVolumeKm > 0 ? `${Math.round(totalVolumeKm)} km` : null;
  const daysStr = activeDays.length > 0 ? `${activeDays.length} løpeøkter` : null;

  let focus = "";

  if (hasIntervals) {
    focus = `Intervaller på programmet denne uken`;
  } else if (hasThreshold) {
    focus = `Terskelarbeid i fokus denne uken`;
  } else if (longRun) {
    focus = `Langtur er ukens høydepunkt`;
  } else {
    focus = `Rolig og kontrollert uke`;
  }

  const details: string[] = [];
  if (daysStr) details.push(daysStr);
  if (volStr) details.push(volStr);
  if (hardDayCount > 0) details.push(`${hardDayCount} hard${hardDayCount === 1 ? "" : "e"} dag${hardDayCount === 1 ? "" : "er"}`);

  if (details.length > 0) {
    focus += ` — ${details.join(", ")}.`;
  } else {
    focus += ".";
  }

  return focus;
}

// ─── Dynamisk personlig hilsen ────────────────────────────────────
function buildGreeting(
  firstName: string | null | undefined,
  today: string,
  todayWorkout: WeeklyPlanDay | null | undefined,
  todaysWorkout: DailyWorkout | null | undefined,
  nextRaceDate: string | null | undefined,
  nextRaceDistance: string | null | undefined,
  selectedMood: string | null | undefined
): string {
  const name = firstName ? `, ${firstName}` : "";
  const hour = new Date().getHours();
  const timeOfDay = hour < 10 ? "God morgen" : hour < 17 ? "Hei" : "God kveld";

  // Etter fullført økt
  if (todaysWorkout?.stravaActivityId) {
    // Finn neste treningsdag i planen
    return `Solid jobb i dag${name}. Nå kan du slappe av.`;
  }

  // Løp om få dager
  if (nextRaceDate && nextRaceDistance) {
    const daysToRace = Math.ceil(
      (new Date(nextRaceDate).getTime() - new Date(today).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (daysToRace > 0 && daysToRace <= 5) {
      return `${daysToRace} ${daysToRace === 1 ? "dag" : "dager"} til ${nextRaceDistance}${name}. Du er klar.`;
    }
  }

  // Etter humørjustering
  if (selectedMood === "tired") {
    return `Vi har lettet litt på planen i dag${name}. Litt er alltid bedre enn ingenting.`;
  }
  if (selectedMood === "strong") {
    return `Bra${name} — men hold igjen. Formen din er best om noen dager.`;
  }

  // Hviledag
  if (!todayWorkout || todayWorkout.workoutType === "rest") {
    return `Hviledag i dag${name}. Kroppen jobber selv om du ikke løper.`;
  }

  // Treningsdag
  return `${timeOfDay}${name}. ${todayWorkout.workoutTypeNorwegian.toLowerCase() === "langtur" ? "Langtur" : "Løpedag"} i dag — her er planen din.`;
}

export function TodayClient({
  weekPlan: initialWeekPlan,
  todaysWorkout: initialTodaysWorkout,
  showTreadmillVariant,
  completedDates: completedDatesArray,
  profile: initialProfile,
  athleteFirstName,
  lastWorkoutReview,
}: TodayClientProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [profile, setProfile] = useState(initialProfile);
  const completedDatesSet = useMemo(
    () => new Set(completedDatesArray || []),
    [completedDatesArray]
  );
  const [weekPlan, setWeekPlan] = useState(initialWeekPlan);
  const [todaysWorkout, setTodaysWorkout] = useState(initialTodaysWorkout);
  const [selectedMood, setSelectedMood] = useState<
    "tired" | "normal" | "strong" | undefined
  >(todaysWorkout?.moodInput as "tired" | "normal" | "strong" | undefined);
  const [moodLoading, setMoodLoading] = useState(false);
  const [moodExplanation, setMoodExplanation] = useState<string | undefined>(
    todaysWorkout?.moodAdjustmentExplanation
  );
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(
    !!todaysWorkout?.feedbackEffort
  );
  const [generating, setGenerating] = useState(false);

  // LastWorkoutReview — starter med server-hentet cached verdi, oppdateres asynkront
  const [review, setReview] = useState<WorkoutReview | null | undefined>(lastWorkoutReview);

  // Hent/generer review asynkront etter sidelast hvis ingen cached versjon finnes
  useEffect(() => {
    if (review !== null && review !== undefined) return; // Allerede cachet — ikke kall API
    let cancelled = false;
    fetch("/api/ai/last-workout-review")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data.review) setReview(data.review);
      })
      .catch(() => {}); // Stille feil — review er optional
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // WorkoutDetail modal state
  const [modalWorkout, setModalWorkout] = useState<WeeklyPlanDay | null>(null);
  const [modalDateLabel, setModalDateLabel] = useState<string>("");

  const today = new Date().toISOString().split("T")[0];

  const todayPlanDay = useMemo(
    () => initialWeekPlan?.days?.find((d) => d.date === today) ?? null,
    [initialWeekPlan, today]
  );
  const [selectedDayDetail, setSelectedDayDetail] = useState<WeeklyPlanDay | null>(todayPlanDay);

  const activeWorkout =
    todaysWorkout?.moodAdjusted || todaysWorkout?.workout || null;

  // Dynamisk hilsen
  const greeting = useMemo(() => buildGreeting(
    athleteFirstName,
    today,
    todayPlanDay,
    todaysWorkout,
    profile?.nextRaceDate,
    profile?.nextRaceDistance,
    selectedMood
  ), [athleteFirstName, today, todayPlanDay, todaysWorkout, profile, selectedMood]);

  // Generate plan
  const handleGeneratePlan = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/ai/generate-plan", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        console.error("[Generate Plan] Server error:", res.status, data);
        throw new Error(data?.error || `Server error ${res.status}`);
      }
      setWeekPlan(data);
      const todayWorkout = data.days?.find(
        (d: WeeklyPlanDay) => d.date === today
      );
      if (todayWorkout) {
        setTodaysWorkout({
          id: "",
          userId: "",
          date: today,
          workout: todayWorkout,
          createdAt: new Date().toISOString(),
        });
        setSelectedDayDetail(todayWorkout);
      }
    } catch (err) {
      console.error("Failed to generate plan:", err);
    } finally {
      setGenerating(false);
    }
  }, [today]);

  // Mood selection
  const handleMoodSelect = useCallback(
    async (mood: "tired" | "normal" | "strong") => {
      setSelectedMood(mood);
      setMoodLoading(true);
      try {
        const res = await fetch("/api/ai/daily-adjustment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mood }),
        });
        if (!res.ok) throw new Error("Failed to adjust workout");
        const result = await res.json();
        setMoodExplanation(result.explanation);
        if (result.changed && result.adjusted) {
          setTodaysWorkout((prev) =>
            prev ? { ...prev, moodInput: mood, moodAdjusted: result.adjusted } : prev
          );
        }
      } catch (err) {
        console.error("Failed to adjust:", err);
      } finally {
        setMoodLoading(false);
      }
    },
    []
  );

  // Post-workout feedback
  const handleFeedback = useCallback(
    async (effort: "harder" | "as_planned" | "easier") => {
      setFeedbackSubmitted(true);
      try {
        await fetch("/api/ai/post-workout-feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ workoutId: todaysWorkout?.id, effort }),
        });
      } catch (err) {
        console.error("Failed to save feedback:", err);
      }
    },
    [todaysWorkout]
  );

  // Day click: toggle selected day + open modal for non-today days
  const handleDayClick = useCallback((day: WeeklyPlanDay) => {
    setSelectedDayDetail(prev => prev?.date === day.date ? null : day);
  }, []);

  // Open WorkoutDetail modal
  const handleOpenModal = useCallback((workout: WeeklyPlanDay) => {
    const label = new Date(workout.date + "T12:00:00").toLocaleDateString("no-NO", {
      weekday: "long", day: "numeric", month: "long",
    });
    setModalWorkout(workout);
    setModalDateLabel(label);
  }, []);

  // ─── No-plan state ─────────────────────────────────────────────
  if (!weekPlan) {
    return (
      <div className="min-h-screen bg-slate-900">
        <AppHeader onSettingsClick={() => setSettingsOpen(true)} />
        {profile && (
          <SettingsDialog
            isOpen={settingsOpen}
            onOpenChange={setSettingsOpen}
            initialProfile={profile}
            onSaved={setProfile}
          />
        )}
        <div className="flex flex-col items-center justify-center px-4 py-20">
          <div className="text-center space-y-4">
            <h2 className="text-xl font-bold text-white">Ingen treningsplan ennå</h2>
            <p className="text-slate-400 text-sm max-w-sm">
              La oss generere din 14-dagers treningsplan basert på din Strava-historikk.
            </p>
            <Button
              onClick={handleGeneratePlan}
              disabled={generating}
              className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-5"
            >
              {generating ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Genererer plan...</>
              ) : (
                <><RefreshCw className="w-4 h-4 mr-2" />Generer treningsplan</>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Main state ────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-900">
      <AppHeader onSettingsClick={() => setSettingsOpen(true)} />
      {profile && (
        <SettingsDialog
          isOpen={settingsOpen}
          onOpenChange={setSettingsOpen}
          initialProfile={profile}
          onSaved={setProfile}
        />
      )}

      {/* WorkoutDetail modal */}
      {modalWorkout && (
        <WorkoutDetailModal
          workout={modalWorkout}
          dateLabel={modalDateLabel}
          isOpen={!!modalWorkout}
          onClose={() => setModalWorkout(null)}
        />
      )}

      <main className="max-w-lg mx-auto px-4 py-6 space-y-4">

        {/* ── Personlig hilsen (erstatter kald statuslinje) ── */}
        <div className="px-1">
          <p className="text-base font-medium text-white leading-snug">{greeting}</p>
        </div>

        {/* ── LastWorkoutReview — mellom hilsen og dagens økt ── */}
        {review && (
          <LastWorkoutReview review={review} />
        )}

        {/* Mood adjustment explanation — only for today */}
        {selectedDayDetail?.date === today && moodExplanation && (
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4">
            <p className="text-sm text-orange-200">{moodExplanation}</p>
          </div>
        )}

        {/* Post-workout feedback */}
        {selectedDayDetail?.date === today && todaysWorkout?.stravaActivityId && todaysWorkout.aiSummary && (
          <PostWorkoutFeedback
            aiSummary={todaysWorkout.aiSummary}
            onFeedback={handleFeedback}
            submitted={feedbackSubmitted}
          />
        )}

        {/* Mood selector */}
        {selectedDayDetail?.date === today && activeWorkout && activeWorkout.workoutType !== "rest" && !selectedMood && (
          <MoodSelector
            onSelect={handleMoodSelect}
            selected={selectedMood}
            loading={moodLoading}
          />
        )}

        {/* Mood confirmed — personlig bekreftelse i stedet for kald statustekst */}
        {selectedDayDetail?.date === today && selectedMood && !moodExplanation && (
          <div className="bg-slate-800/40 rounded-xl p-3 border border-slate-700/50 text-center">
            <span className="text-sm text-slate-300">
              {selectedMood === "tired"
                ? "😴 Vi lettet litt på planen — litt er alltid bedre enn ingenting."
                : selectedMood === "strong"
                ? "⚡ Bra — men hold igjen. Formen er best om noen dager."
                : "😊 Planen beholdes — du er i rute."}
            </span>
          </div>
        )}

        {/* 14-day overview */}
        {weekPlan?.days && (
          <WeekOverview
            days={weekPlan.days}
            today={today}
            completedDates={completedDatesSet}
            selectedDate={selectedDayDetail?.date}
            onDayClick={handleDayClick}
          />
        )}

        {/* Single workout detail panel */}
        {selectedDayDetail && (
          <div key={selectedDayDetail.date} className="animate-fade-in">
            <button
              className="w-full text-left focus:outline-none"
              onClick={() => handleOpenModal(
                selectedDayDetail.date === today && activeWorkout
                  ? activeWorkout
                  : selectedDayDetail
              )}
            >
              <WorkoutCard
                workout={
                  selectedDayDetail.date === today && activeWorkout
                    ? activeWorkout
                    : selectedDayDetail
                }
                isToday={selectedDayDetail.date === today}
                showTreadmillVariant={selectedDayDetail.date === today ? showTreadmillVariant : false}
                dateLabel={new Date(selectedDayDetail.date + "T12:00:00").toLocaleDateString("no-NO", {
                  weekday: "long", day: "numeric", month: "long"
                })}
              />
            </button>
            {/* Subtil hint om at man kan klikke */}
            <p className="text-xs text-slate-600 text-center mt-1.5">
              Trykk på kortet for full øktstruktur
            </p>
          </div>
        )}

        {/* ── Uksfokus-boks (erstatter 'Planens fokus') ── */}
        {weekPlan && (
          <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-700/50">
            <h3 className="text-xs text-slate-500 uppercase tracking-wider mb-2 font-medium">
              Denne uken
            </h3>
            <p className="text-sm text-slate-300 leading-relaxed">
              {weekPlan.weekFocus || buildWeekFocus(weekPlan)}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
