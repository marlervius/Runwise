"use client";

import { WorkoutReview, WorkoutReviewRating } from "@/types/runwise";

interface LastWorkoutReviewProps {
  review: WorkoutReview;
}

const RATING_CONFIG: Record<
  WorkoutReviewRating,
  { icon: string; borderColor: string; label: string }
> = {
  excellent: { icon: "⭐", borderColor: "#F5A623", label: "Fremragende" },
  good:      { icon: "✅", borderColor: "#2ECC71", label: "Solid" },
  ok:        { icon: "👍", borderColor: "#3498DB", label: "Greit" },
  hard:      { icon: "😓", borderColor: "#E74C3C", label: "Tøff" },
  missed:    { icon: "💤", borderColor: "#888888", label: "Ingen økt" },
};

export function LastWorkoutReview({ review }: LastWorkoutReviewProps) {
  const config = RATING_CONFIG[review.rating] ?? RATING_CONFIG.ok;

  // Format date nicely
  const dateLabel = (() => {
    try {
      // createdAt is from DB, but ideally activity date — use createdAt as proxy
      const d = new Date(review.createdAt);
      return d.toLocaleDateString("no-NO", { weekday: "long", day: "numeric", month: "long" });
    } catch {
      return "";
    }
  })();

  return (
    <div
      className="bg-slate-800/40 rounded-xl border border-slate-700/50 overflow-hidden"
      style={{ borderLeftWidth: "3px", borderLeftColor: config.borderColor }}
    >
      {/* Header */}
      <div className="px-4 pt-3 pb-1 flex items-center gap-2">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Siste økt
        </span>
        {dateLabel && (
          <span className="text-xs text-slate-600">&middot; {dateLabel}</span>
        )}
        <span className="ml-auto text-base">{config.icon}</span>
      </div>

      {/* Headline */}
      <div className="px-4 pb-1">
        <p className="text-sm font-semibold text-white leading-snug">
          {review.headline}
        </p>
      </div>

      {/* Body */}
      {review.body && (
        <div className="px-4 pb-2">
          <p className="text-sm text-slate-300 leading-relaxed">{review.body}</p>
        </div>
      )}

      {/* Key observation + next implication */}
      {(review.keyObservation || review.nextImplication) && (
        <div className="px-4 pb-3 flex flex-col gap-1">
          {review.keyObservation && (
            <p className="text-xs text-slate-400 leading-snug">
              <span className="text-slate-500">Obs: </span>
              {review.keyObservation}
            </p>
          )}
          {review.nextImplication && (
            <p className="text-xs text-slate-400 leading-snug">
              <span className="text-slate-500">Neste: </span>
              {review.nextImplication}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
