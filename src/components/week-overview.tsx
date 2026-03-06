"use client";

import { WeeklyPlanDay } from "@/types/runwise";

const DAY_LABELS = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];

const TYPE_COLORS: Record<string, string> = {
  easy: "bg-blue-500",
  recovery: "bg-teal-500",
  threshold: "bg-yellow-500",
  interval: "bg-red-500",
  long: "bg-green-500",
  rest: "bg-slate-600",
};

const TYPE_ABBREVS: Record<string, string> = {
  easy: "R",
  recovery: "Re",
  threshold: "T",
  interval: "I",
  long: "L",
  rest: "H",
};

interface WeekOverviewProps {
  days: WeeklyPlanDay[];
  today: string; // ISO date
  onDayClick?: (day: WeeklyPlanDay) => void;
}

export function WeekOverview({ days, today, onDayClick }: WeekOverviewProps) {
  return (
    <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-700/50">
      <h3 className="text-xs text-slate-500 uppercase tracking-wider mb-3 font-medium">
        Ukeoversikt
      </h3>
      <div className="grid grid-cols-7 gap-2">
        {days.map((day, i) => {
          const isToday = day.date === today;
          const color = TYPE_COLORS[day.workoutType] || TYPE_COLORS.rest;
          const abbrev = TYPE_ABBREVS[day.workoutType] || "?";

          return (
            <button
              key={day.date}
              onClick={() => onDayClick?.(day)}
              className={`flex flex-col items-center gap-1.5 py-2 rounded-lg transition-all ${
                isToday
                  ? "ring-2 ring-orange-500 bg-slate-700/50"
                  : "hover:bg-slate-700/30"
              }`}
            >
              <span className="text-[10px] text-slate-500 font-medium">
                {DAY_LABELS[i]}
              </span>
              <div
                className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center ${
                  day.isHardDay ? "ring-1 ring-white/30" : ""
                }`}
              >
                <span className="text-white text-xs font-bold">{abbrev}</span>
              </div>
              {day.workoutType !== "rest" && (
                <span className="text-[10px] text-slate-500">
                  {day.estimatedDistanceKm > 0
                    ? `${day.estimatedDistanceKm.toFixed(0)}km`
                    : ""}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
