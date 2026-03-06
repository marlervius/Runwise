"use client";

import { useState, useCallback } from "react";
import { AppHeader } from "@/components/app-header";
import { WorkoutCard } from "@/components/workout-card";
import { WeekOverview } from "@/components/week-overview";
import { MoodSelector } from "@/components/mood-selector";
import { PostWorkoutFeedback } from "@/components/post-workout-feedback";
import { WeeklyPlan, WeeklyPlanDay, DailyWorkout } from "@/types/runwise";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface TodayClientProps {
  weekPlan: WeeklyPlan | null;
  todaysWorkout: DailyWorkout | null;
  showTreadmillVariant: boolean;
}

export function TodayClient({
  weekPlan: initialWeekPlan,
  todaysWorkout: initialTodaysWorkout,
  showTreadmillVariant,
}: TodayClientProps) {
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
  const [selectedDayDetail, setSelectedDayDetail] = useState<WeeklyPlanDay | null>(null);

  const today = new Date().toISOString().split("T")[0];

  // Get the active workout (mood-adjusted or planned)
  const activeWorkout =
    todaysWorkout?.moodAdjusted || todaysWorkout?.workout || null;

  const todayLabel = new Date().toLocaleDateString("no-NO", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  // Generate plan if missing
  const handleGeneratePlan = useCallback(async () => {
    setGenerating(true);
    try {
      const res = await fetch("/api/ai/generate-plan", { method: "POST" });
      if (!res.ok) throw new Error("Failed to generate plan");
      const plan = await res.json();
      setWeekPlan(plan);

      // Find today's workout from the plan
      const todayWorkout = plan.days?.find(
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
      }
    } catch (err) {
      console.error("Failed to generate plan:", err);
    } finally {
      setGenerating(false);
    }
  }, [today]);

  // Handle mood selection
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
            prev
              ? { ...prev, moodInput: mood, moodAdjusted: result.adjusted }
              : prev
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

  // Handle post-workout feedback
  const handleFeedback = useCallback(
    async (effort: "harder" | "as_planned" | "easier") => {
      setFeedbackSubmitted(true);
      try {
        await fetch("/api/ai/post-workout-feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            workoutId: todaysWorkout?.id,
            effort,
          }),
        });
      } catch (err) {
        console.error("Failed to save feedback:", err);
      }
    },
    [todaysWorkout]
  );

  // Handle day click in week overview
  const handleDayClick = (day: WeeklyPlanDay) => {
    if (day.date === today) {
      setSelectedDayDetail(null);
    } else {
      setSelectedDayDetail(
        selectedDayDetail?.date === day.date ? null : day
      );
    }
  };

  // No plan yet state
  if (!weekPlan) {
    return (
      <div className="min-h-screen bg-slate-900">
        <AppHeader />
        <div className="flex flex-col items-center justify-center px-4 py-20">
          <div className="text-center space-y-4">
            <h2 className="text-xl font-bold text-white">
              Ingen treningsplan ennå
            </h2>
            <p className="text-slate-400 text-sm max-w-sm">
              La oss generere din ukentlige treningsplan basert på din
              Strava-historikk.
            </p>
            <Button
              onClick={handleGeneratePlan}
              disabled={generating}
              className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-5"
            >
              {generating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Genererer plan...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Generer treningsplan
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900">
      <AppHeader />

      <main className="max-w-lg mx-auto px-4 py-6 space-y-4">
        {/* Today's workout */}
        {activeWorkout && (
          <WorkoutCard
            workout={activeWorkout}
            isToday
            showTreadmillVariant={showTreadmillVariant}
            dateLabel={todayLabel}
          />
        )}

        {/* Mood adjustment explanation */}
        {moodExplanation && (
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4">
            <p className="text-sm text-orange-200">{moodExplanation}</p>
          </div>
        )}

        {/* Post-workout feedback (if activity detected) */}
        {todaysWorkout?.stravaActivityId && todaysWorkout.aiSummary && (
          <PostWorkoutFeedback
            aiSummary={todaysWorkout.aiSummary}
            onFeedback={handleFeedback}
            submitted={feedbackSubmitted}
          />
        )}

        {/* Mood selector */}
        {activeWorkout && activeWorkout.workoutType !== "rest" && (
          <MoodSelector
            onSelect={handleMoodSelect}
            selected={selectedMood}
            loading={moodLoading}
          />
        )}

        {/* Week overview */}
        {weekPlan?.days && (
          <WeekOverview
            days={weekPlan.days}
            today={today}
            onDayClick={handleDayClick}
          />
        )}

        {/* Selected day detail */}
        {selectedDayDetail && (
          <WorkoutCard
            workout={selectedDayDetail}
            dateLabel={new Date(selectedDayDetail.date).toLocaleDateString(
              "no-NO",
              { weekday: "long", day: "numeric", month: "long" }
            )}
          />
        )}

        {/* Week rationale */}
        {weekPlan?.rationale && (
          <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-700/50">
            <h3 className="text-xs text-slate-500 uppercase tracking-wider mb-2 font-medium">
              Ukens fokus
            </h3>
            <p className="text-sm text-slate-400">{weekPlan.rationale}</p>
          </div>
        )}
      </main>
    </div>
  );
}
