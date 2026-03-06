"use client";

import { Loader2 } from "lucide-react";

interface MoodSelectorProps {
  onSelect: (mood: "tired" | "normal" | "strong") => void;
  selected?: "tired" | "normal" | "strong";
  loading: boolean;
}

const MOODS = [
  {
    value: "tired" as const,
    emoji: "\u{1F634}",
    label: "Sliten",
    color: "bg-blue-500/20 hover:bg-blue-500/30 border-blue-500/30",
    selectedColor: "bg-blue-500 border-blue-400",
  },
  {
    value: "normal" as const,
    emoji: "\u{1F60A}",
    label: "Normal",
    color: "bg-slate-500/20 hover:bg-slate-500/30 border-slate-500/30",
    selectedColor: "bg-slate-600 border-slate-400",
  },
  {
    value: "strong" as const,
    emoji: "\u{26A1}",
    label: "Sterk",
    color: "bg-orange-500/20 hover:bg-orange-500/30 border-orange-500/30",
    selectedColor: "bg-orange-500 border-orange-400",
  },
];

export function MoodSelector({ onSelect, selected, loading }: MoodSelectorProps) {
  return (
    <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-700/50">
      <h3 className="text-sm text-slate-400 mb-3 text-center">
        Hvordan føler du deg i dag?
      </h3>
      <div className="flex gap-3">
        {MOODS.map((mood) => {
          const isSelected = selected === mood.value;
          return (
            <button
              key={mood.value}
              onClick={() => onSelect(mood.value)}
              disabled={loading}
              className={`flex-1 py-3 rounded-xl border text-center transition-all ${
                isSelected ? mood.selectedColor : mood.color
              } ${loading ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {loading && isSelected ? (
                <Loader2 className="w-5 h-5 animate-spin mx-auto text-white" />
              ) : (
                <>
                  <span className="text-2xl block mb-1">{mood.emoji}</span>
                  <span className="text-xs text-white font-medium">
                    {mood.label}
                  </span>
                </>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
