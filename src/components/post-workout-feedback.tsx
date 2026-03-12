"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle } from "lucide-react";

interface PostWorkoutFeedbackProps {
  aiSummary: string;
  onFeedback: (effort: "harder" | "as_planned" | "easier") => void;
  submitted: boolean;
}

const EFFORT_OPTIONS = [
  { value: "harder" as const, label: "Tyngre enn forventet" },
  { value: "as_planned" as const, label: "Som planlagt" },
  { value: "easier" as const, label: "Lettere enn forventet" },
];

export function PostWorkoutFeedback({
  aiSummary,
  onFeedback,
  submitted,
}: PostWorkoutFeedbackProps) {
  const [selectedEffort, setSelectedEffort] = useState<string | null>(null);

  const handleSelect = (effort: "harder" | "as_planned" | "easier") => {
    setSelectedEffort(effort);
    onFeedback(effort);
  };

  return (
    <Card className="border-emerald-500/30 bg-emerald-500/5">
      <CardContent className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle className="w-5 h-5 text-emerald-400" />
          <h3 className="text-sm font-medium text-emerald-400">
            Du har løpt i dag!
          </h3>
        </div>

        <p className="text-slate-300 text-sm leading-relaxed mb-4">
          {aiSummary}
        </p>

        {!submitted && (
          <>
            <p className="text-xs text-slate-500 mb-2">Hvordan føltes det?</p>
            <div className="flex gap-2">
              {EFFORT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleSelect(opt.value)}
                  className={`flex-1 py-2.5 px-2 rounded-lg text-xs font-medium transition-all border ${
                    selectedEffort === opt.value
                      ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
                      : "bg-slate-800/50 border-slate-700/50 text-slate-400 hover:bg-slate-700/50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </>
        )}

        {submitted && (
          <p className="text-xs text-emerald-400/70 mt-2">
            Takk for tilbakemeldingen!
          </p>
        )}
      </CardContent>
    </Card>
  );
}
