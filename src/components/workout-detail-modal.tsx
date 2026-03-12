"use client";

import { WeeklyPlanDay, WorkoutPhase } from "@/types/runwise";
import { X, Dumbbell } from "lucide-react";
import { useState } from "react";

interface WorkoutDetailModalProps {
  workout: WeeklyPlanDay;
  dateLabel: string;
  isOpen: boolean;
  onClose: () => void;
}

const WORKOUT_COLORS: Record<string, { bg: string; border: string; badge: string; text: string }> = {
  easy:      { bg: "bg-emerald-500/10", border: "border-emerald-500/30", badge: "bg-emerald-500/20 text-emerald-300", text: "text-emerald-400" },
  long:      { bg: "bg-blue-500/10",    border: "border-blue-500/30",    badge: "bg-blue-500/20 text-blue-300",    text: "text-blue-400"    },
  threshold: { bg: "bg-orange-500/10",  border: "border-orange-500/30",  badge: "bg-orange-500/20 text-orange-300", text: "text-orange-400" },
  interval:  { bg: "bg-red-500/10",     border: "border-red-500/30",     badge: "bg-red-500/20 text-red-300",     text: "text-red-400"     },
  recovery:  { bg: "bg-slate-500/10",   border: "border-slate-500/30",   badge: "bg-slate-500/20 text-slate-300", text: "text-slate-400"   },
  rest:      { bg: "bg-slate-800/40",   border: "border-slate-700/50",   badge: "bg-slate-700/50 text-slate-400", text: "text-slate-500"   },
};

function PhaseRow({ phase }: { phase: WorkoutPhase }) {
  return (
    <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-0.5 py-2.5 border-b border-slate-700/40 last:border-0">
      <div>
        <p className="text-sm font-medium text-white leading-snug">{phase.phase}</p>
        {phase.note && (
          <p className="text-xs text-slate-400 mt-0.5">{phase.note}</p>
        )}
      </div>
      <div className="text-right min-w-[64px]">
        <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Tid</p>
        <p className="text-sm text-slate-200">{phase.duration}</p>
      </div>
      <div className="text-right min-w-[80px]">
        <p className="text-xs text-slate-400 uppercase tracking-wide mb-0.5">Pace / Sone</p>
        <p className="text-sm text-slate-200">{phase.pace || "—"}</p>
        {phase.hrZone && (
          <p className="text-xs text-slate-500">{phase.hrZone}</p>
        )}
      </div>
    </div>
  );
}

export function WorkoutDetailModal({ workout, dateLabel, isOpen, onClose }: WorkoutDetailModalProps) {
  const [showTreadmill, setShowTreadmill] = useState(false);

  if (!isOpen) return null;

  const colors = WORKOUT_COLORS[workout.workoutType] ?? WORKOUT_COLORS.easy;
  const isRest = workout.workoutType === "rest";

  // Build fallback structure if AI didn't generate one
  const structure: WorkoutPhase[] = workout.structure && workout.structure.length > 0
    ? workout.structure
    : isRest
    ? []
    : [
        { phase: "Oppvarming", duration: "10 min", pace: workout.paceZone?.split("–")[1] ?? "Lett", hrZone: "Z1–Z2" },
        { phase: "Hoveddel", duration: `${Math.max(5, workout.durationMinutes - 20)} min`, pace: workout.paceZone ?? "—", hrZone: workout.intensityZone },
        { phase: "Nedkjøling", duration: "10 min", pace: "Rolig", hrZone: "Z1" },
      ];

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-x-4 bottom-0 top-16 z-50 flex items-end sm:items-center justify-center sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-md">
        <div className={`w-full bg-slate-900 rounded-t-2xl sm:rounded-2xl border ${colors.border} shadow-2xl max-h-[85vh] flex flex-col`}>

          {/* Header */}
          <div className={`flex items-start justify-between p-5 border-b ${colors.border}`}>
            <div className="flex-1 pr-3">
              <p className="text-xs text-slate-500 uppercase tracking-wider mb-1">{dateLabel}</p>
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${colors.badge}`}>
                  {workout.workoutTypeNorwegian}
                </span>
                {!isRest && (
                  <>
                    <span className="text-xs text-slate-500">{workout.durationMinutes} min</span>
                    <span className="text-xs text-slate-600">·</span>
                    <span className="text-xs text-slate-500">{workout.estimatedDistanceKm} km</span>
                  </>
                )}
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-slate-500 hover:text-slate-300 transition-colors flex-shrink-0 mt-0.5"
              aria-label="Lukk"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Scrollable body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5">

            {/* Begrunnelse */}
            <div>
              <p className="text-sm text-slate-200 leading-relaxed">{workout.description}</p>
            </div>

            {/* Nøkkeltall */}
            {!isRest && (
              <div className="grid grid-cols-3 gap-3">
                {workout.paceZone && (
                  <div className="bg-slate-800/60 rounded-xl p-3 text-center">
                    <p className="text-xs text-slate-500 mb-1">Pace</p>
                    <p className="text-sm font-semibold text-white">{workout.paceZone}</p>
                  </div>
                )}
                {workout.hrZone && (
                  <div className="bg-slate-800/60 rounded-xl p-3 text-center">
                    <p className="text-xs text-slate-500 mb-1">Puls</p>
                    <p className="text-sm font-semibold text-white">{workout.hrZone}</p>
                  </div>
                )}
                <div className="bg-slate-800/60 rounded-xl p-3 text-center">
                  <p className="text-xs text-slate-500 mb-1">Sone</p>
                  <p className="text-sm font-semibold text-white">{workout.intensityZone}</p>
                </div>
              </div>
            )}

            {/* Øktstruktur */}
            {structure.length > 0 && (
              <div>
                <h3 className="text-xs text-slate-500 uppercase tracking-wider mb-3 font-medium">
                  Øktstruktur
                </h3>
                <div className={`rounded-xl border ${colors.border} divide-y divide-slate-700/40 overflow-hidden`}>
                  {(showTreadmill && workout.treadmillVariant ? [] : structure).map((phase, i) => (
                    <PhaseRow key={i} phase={phase} />
                  ))}

                  {/* Tredemølle-variant */}
                  {showTreadmill && workout.treadmillVariant && (
                    <div className="p-4">
                      <p className="text-sm text-slate-300 leading-relaxed">{workout.treadmillVariant}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Hviledag-tekst */}
            {isRest && (
              <div className="bg-slate-800/40 rounded-xl p-4 text-center">
                <p className="text-slate-400 text-sm">Hvil i dag. Det er ikke latskap — det er en del av planen.</p>
              </div>
            )}
          </div>

          {/* Footer — mølle-knapp */}
          {workout.treadmillVariant && !isRest && (
            <div className="p-4 border-t border-slate-800">
              <button
                onClick={() => setShowTreadmill(!showTreadmill)}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 transition-colors text-sm text-slate-300"
              >
                <Dumbbell className="w-4 h-4" />
                {showTreadmill ? "Vis utendørs-versjon" : "Vis mølle-versjon"}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
