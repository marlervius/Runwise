"use client";

import { WeeklyPlanDay } from "@/types/runwise";
import { Card, CardContent } from "@/components/ui/card";
import {
  Footprints,
  Zap,
  Timer,
  Bed,
  Route,
  Heart,
} from "lucide-react";

const WORKOUT_CONFIG: Record<
  string,
  { icon: typeof Footprints; color: string; bgColor: string }
> = {
  easy: { icon: Footprints, color: "text-blue-400", bgColor: "bg-blue-500/20" },
  recovery: { icon: Heart, color: "text-teal-400", bgColor: "bg-teal-500/20" },
  threshold: { icon: Timer, color: "text-yellow-400", bgColor: "bg-yellow-500/20" },
  interval: { icon: Zap, color: "text-red-400", bgColor: "bg-red-500/20" },
  long: { icon: Route, color: "text-green-400", bgColor: "bg-green-500/20" },
  rest: { icon: Bed, color: "text-slate-400", bgColor: "bg-slate-500/20" },
};

interface WorkoutCardProps {
  workout: WeeklyPlanDay;
  isToday?: boolean;
  showTreadmillVariant?: boolean;
  dateLabel?: string;
}

export function WorkoutCard({
  workout,
  isToday = false,
  showTreadmillVariant = false,
  dateLabel,
}: WorkoutCardProps) {
  const config = WORKOUT_CONFIG[workout.workoutType] || WORKOUT_CONFIG.easy;
  const Icon = config.icon;

  return (
    <Card
      className={`border transition-all ${
        isToday
          ? "border-orange-500/50 bg-slate-800/80 shadow-lg shadow-orange-500/10"
          : "border-slate-700/50 bg-slate-800/40"
      }`}
    >
      <CardContent className="p-5">
        {/* Date label */}
        {dateLabel && (
          <p className="text-xs text-slate-500 uppercase tracking-wider mb-3 font-medium">
            {dateLabel}
          </p>
        )}

        {/* Workout type header */}
        <div className="flex items-center gap-3 mb-4">
          <div
            className={`w-12 h-12 rounded-xl ${config.bgColor} flex items-center justify-center`}
          >
            <Icon className={`w-6 h-6 ${config.color}`} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">
              {workout.workoutTypeNorwegian}
            </h3>
            {workout.workoutType !== "rest" && (
              <p className="text-sm text-slate-400">
                {workout.durationMinutes} min
                {workout.estimatedDistanceKm > 0 &&
                  ` · ~${workout.estimatedDistanceKm.toFixed(1)} km`}
              </p>
            )}
          </div>
        </div>

        {/* Description */}
        <p className="text-slate-300 text-sm leading-relaxed mb-4">
          {workout.description}
        </p>

        {/* Zones */}
        {workout.workoutType !== "rest" && (
          <div className="flex gap-4 text-xs">
            {workout.paceZone && (
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-orange-500" />
                <span className="text-slate-400">Pace:</span>
                <span className="text-white font-medium">{workout.paceZone}</span>
              </div>
            )}
            {workout.hrZone && (
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-red-500" />
                <span className="text-slate-400">HR:</span>
                <span className="text-white font-medium">{workout.hrZone}</span>
              </div>
            )}
            {workout.intensityZone && (
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-purple-500" />
                <span className="text-white font-medium">
                  {workout.intensityZone}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Treadmill variant */}
        {showTreadmillVariant && workout.treadmillVariant && (
          <div className="mt-4 pt-3 border-t border-slate-700/50">
            <p className="text-xs text-slate-500 mb-1">Tredemølleversjon:</p>
            <p className="text-sm text-slate-400">{workout.treadmillVariant}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
