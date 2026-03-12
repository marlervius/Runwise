"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CheckCircle,
  ArrowRight,
  Loader2,
  Calendar,
  Footprints,
  Dumbbell,
} from "lucide-react";

type Step = "connected" | "questions" | "analyzing";

const RACE_DISTANCES = [
  "5K",
  "10K",
  "Halvmaraton",
  "Maraton",
  "Annet",
];

const TREADMILL_OPTIONS = [
  { value: "no" as const, label: "Nei" },
  { value: "sometimes" as const, label: "Av og til" },
  { value: "yes" as const, label: "Ja" },
];

export function OnboardingClient() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("connected");
  const [nextRaceDate, setNextRaceDate] = useState("");
  const [nextRaceDistance, setNextRaceDistance] = useState("");
  const [trainingDays, setTrainingDays] = useState(4);
  const [treadmill, setTreadmill] = useState<"yes" | "no" | "sometimes">("no");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [analyzeStatus, setAnalyzeStatus] = useState("");

  const handleComplete = async () => {
    setStep("analyzing");
    setIsLoading(true);
    setError("");

    try {
      setAnalyzeStatus("Analyserer din Strava-historikk...");
      await new Promise((r) => setTimeout(r, 500));

      setAnalyzeStatus("Beregner treningssoner og VDOT...");
      const response = await fetch("/api/onboarding/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nextRaceDate: nextRaceDate || null,
          nextRaceDistance: nextRaceDistance || null,
          trainingDaysPerWeek: trainingDays,
          treadmillPreference: treadmill,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Noe gikk galt");
      }

      setAnalyzeStatus("Din første treningsplan er klar!");
      await new Promise((r) => setTimeout(r, 1000));
      router.push("/today");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Ukjent feil";
      setError(message);
      setStep("questions");
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900/50 to-slate-900 flex items-center justify-center px-4 py-8">
      <Card className="w-full max-w-lg bg-slate-900/80 border-slate-700/50 backdrop-blur-sm">
        <CardContent className="p-8">
          {/* Step 1: Connected */}
          {step === "connected" && (
            <div className="text-center space-y-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/20">
                <CheckCircle className="w-8 h-8 text-emerald-400" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-2">
                  Strava er koblet til!
                </h2>
                <p className="text-slate-400">
                  Vi har tilgang til treningshistorikken din. La oss sette opp
                  planen din.
                </p>
              </div>
              <Button
                onClick={() => setStep("questions")}
                className="bg-orange-500 hover:bg-orange-600 text-white w-full py-6 text-lg"
              >
                La oss begynne
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </div>
          )}

          {/* Step 2: Questions */}
          {step === "questions" && (
            <div className="space-y-8">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-white mb-2">
                  Tre kjappe spørsmål
                </h2>
                <p className="text-slate-400 text-sm">
                  Tar under 1 minutt. Du kan endre alt senere.
                </p>
              </div>

              {error && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
                  {error}
                </div>
              )}

              {/* Question 1: Next Race */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-white">
                  <Calendar className="w-5 h-5 text-orange-400" />
                  <Label className="text-base font-medium">
                    Hva er ditt neste løp?
                  </Label>
                  <span className="text-xs text-slate-500">(valgfritt)</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    type="date"
                    value={nextRaceDate}
                    onChange={(e) => setNextRaceDate(e.target.value)}
                    className="bg-slate-800 border-slate-600 text-white"
                    placeholder="Velg dato"
                  />
                  <select
                    value={nextRaceDistance}
                    onChange={(e) => setNextRaceDistance(e.target.value)}
                    className="flex h-10 rounded-md border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
                  >
                    <option value="">Distanse</option>
                    {RACE_DISTANCES.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Question 2: Training Days */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-white">
                  <Footprints className="w-5 h-5 text-purple-400" />
                  <Label className="text-base font-medium">
                    Hvor mange dager i uken kan du løpe?
                  </Label>
                </div>
                <div className="flex gap-2">
                  {[2, 3, 4, 5, 6, 7].map((n) => (
                    <button
                      key={n}
                      onClick={() => setTrainingDays(n)}
                      className={`flex-1 py-3 rounded-lg text-sm font-medium transition-all ${
                        trainingDays === n
                          ? "bg-orange-500 text-white shadow-lg shadow-orange-500/30"
                          : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>

              {/* Question 3: Treadmill */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-white">
                  <Dumbbell className="w-5 h-5 text-emerald-400" />
                  <Label className="text-base font-medium">
                    Løper du noen ganger på tredemølle?
                  </Label>
                </div>
                <div className="flex gap-2">
                  {TREADMILL_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setTreadmill(opt.value)}
                      className={`flex-1 py-3 rounded-lg text-sm font-medium transition-all ${
                        treadmill === opt.value
                          ? "bg-orange-500 text-white shadow-lg shadow-orange-500/30"
                          : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <Button
                onClick={handleComplete}
                className="bg-orange-500 hover:bg-orange-600 text-white w-full py-6 text-lg"
                disabled={isLoading}
              >
                Lag min treningsplan
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </div>
          )}

          {/* Step 3: Analyzing */}
          {step === "analyzing" && (
            <div className="text-center space-y-8 py-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-orange-500/20">
                {analyzeStatus.includes("klar") ? (
                  <CheckCircle className="w-8 h-8 text-emerald-400" />
                ) : (
                  <Loader2 className="w-8 h-8 text-orange-400 animate-spin" />
                )}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-white mb-3">
                  {analyzeStatus.includes("klar")
                    ? "Din første uke er klar!"
                    : "Jobber med planen din..."}
                </h2>
                <p className="text-slate-400">{analyzeStatus}</p>
              </div>

              {/* Progress dots */}
              <div className="flex justify-center gap-2">
                <div className="w-3 h-3 rounded-full bg-orange-500 animate-pulse" />
                <div
                  className="w-3 h-3 rounded-full bg-orange-500 animate-pulse"
                  style={{ animationDelay: "0.2s" }}
                />
                <div
                  className="w-3 h-3 rounded-full bg-orange-500 animate-pulse"
                  style={{ animationDelay: "0.4s" }}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
