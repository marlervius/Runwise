"use client";

import { WeeklyPlanDay } from "@/types/runwise";
import { Check } from "lucide-react";

const DAY_LABELS_SHORT: Record<number, string> = {
  1: "Man",
  2: "Tir",
  3: "Ons",
  4: "Tor",
  5: "Fre",
  6: "Lør",
  7: "Søn",
};

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

interface DayButtonProps {
  day: WeeklyPlanDay;
  today: string;
  selectedDate?: string;
  completedDates?: Set<string>;
  onDayClick?: (day: WeeklyPlanDay) => void;
}

function DayButton({ day, today, selectedDate, completedDates, onDayClick }: DayButtonProps) {
  const isToday = day.date === today;
  const isPast = day.date < today;
  const isSelected = day.date === selectedDate;
  const isCompleted = completedDates?.has(day.date);
  const color = TYPE_COLORS[day.workoutType] || TYPE_COLORS.rest;
  const abbrev = TYPE_ABBREVS[day.workoutType] || "?";
  const dayLabel = DAY_LABELS_SHORT[day.dayOfWeek] ?? day.date.split("-")[2];

  return (
    <button
      type="button"
      onClick={() => onDayClick?.(day)}
      className={[
        "flex flex-col items-center gap-1 py-1.5 rounded-lg transition-all",
        isToday
          ? "ring-2 ring-orange-500 bg-slate-700/50"
          : isSelected
            ? "ring-2 ring-white/60 bg-slate-700/60"
            : isPast
              ? "opacity-60 hover:opacity-90 hover:bg-slate-700/20"
              : "hover:bg-slate-700/30",
      ].join(" ")}
    >
      <span className="text-[10px] text-slate-500 font-medium">{dayLabel}</span>
      <div
        className={`w-8 h-8 rounded-lg ${color} flex items-center justify-center ${
          day.isHardDay ? "ring-1 ring-white/30" : ""
        }`}
      >
        {isCompleted ? (
          <Check className="w-4 h-4 text-white" />
        ) : (
          <span className="text-white text-xs font-bold">{abbrev}</span>
        )}
      </div>
      <span className="text-[9px] text-slate-500">{day.date.split("-")[2]}</span>
    </button>
  );
}

interface WeekRowProps {
  label: string;
  days: WeeklyPlanDay[];
  today: string;
  selectedDate?: string;
  completedDates?: Set<string>;
  onDayClick?: (day: WeeklyPlanDay) => void;
}

function WeekRow({ label, days, today, selectedDate, completedDates, onDayClick }: WeekRowProps) {
  return (
    <div>
      <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-2 font-medium">
        {label}
      </p>
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((day) => (
          <DayButton
            key={day.date}
            day={day}
            today={today}
            selectedDate={selectedDate}
            completedDates={completedDates}
            onDayClick={onDayClick}
          />
        ))}
      </div>
    </div>
  );
}

interface WeekOverviewProps {
  days: WeeklyPlanDay[];
  today: string;
  completedDates?: Set<string>;
  selectedDate?: string;
  onDayClick?: (day: WeeklyPlanDay) => void;
}

export function WeekOverview({
  days,
  today,
  completedDates,
  selectedDate,
  onDayClick,
}: WeekOverviewProps) {
  const week1 = days.slice(0, 7);
  const week2 = days.slice(7, 14);

  return (
    <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-700/50 space-y-3">
      <h3 className="text-xs text-slate-500 uppercase tracking-wider font-medium">
        14-dagers plan
      </h3>
      <WeekRow
        label="Uke 1"
        days={week1}
        today={today}
        selectedDate={selectedDate}
        completedDates={completedDates}
        onDayClick={onDayClick}
      />
      {week2.length > 0 && (
        <WeekRow
          label="Uke 2"
          days={week2}
          today={today}
          selectedDate={selectedDate}
          completedDates={completedDates}
          onDayClick={onDayClick}
        />
      )}
    </div>
  );
}
