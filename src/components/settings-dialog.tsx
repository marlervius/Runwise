"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Save,
  Loader2,
  Download,
  CheckCircle2,
  AlertCircle,
  Heart,
  Target,
  Dumbbell,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { RunwiseUserProfile } from "@/types/runwise";

interface SettingsDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  initialProfile: RunwiseUserProfile;
  onSaved?: (profile: RunwiseUserProfile) => void;
}

interface HRImportResult {
  detectedMaxHR: number | null;
  stravaMaxHR: number | null;
  athleteMaxHR: number | null;
  bestMaxHR: number | null;
  activitiesScanned: number;
  stravaZones: { min: number; max: number }[] | null;
}

export function SettingsDialog({
  isOpen,
  onOpenChange,
  initialProfile,
  onSaved,
}: SettingsDialogProps) {
  // Form state — mirrors RunwiseUserProfile fields
  const [maxHR, setMaxHR] = useState(initialProfile.maxHR || 0);
  const [restingHR, setRestingHR] = useState(initialProfile.restingHR || 0);
  const [goal, setGoal] = useState(initialProfile.goal || "");
  const [nextRaceDate, setNextRaceDate] = useState(initialProfile.nextRaceDate || "");
  const [nextRaceDistance, setNextRaceDistance] = useState(initialProfile.nextRaceDistance || "");
  const [trainingDaysPerWeek, setTrainingDaysPerWeek] = useState(initialProfile.trainingDaysPerWeek || 3);
  const [treadmillPreference, setTreadmillPreference] = useState<"yes" | "no" | "sometimes">(
    initialProfile.treadmillPreference || "no"
  );
  const [injuryHistory, setInjuryHistory] = useState(initialProfile.injuryHistory || "");
  const [aiPersonality, setAiPersonality] = useState(initialProfile.aiPersonality || "Supportive Coach");
  const [lactateThreshold, setLactateThreshold] = useState(initialProfile.lactateThreshold || "");

  // Custom HR zones — 5 zones, each with a max bpm (min is derived from previous zone's max)
  // Stored as [z1max, z2max, z3max, z4max] — z5max = maxHR
  const initZoneMaxes = (zones: { min: number; max: number }[] | null | undefined): string[] => {
    if (zones && zones.length >= 5) return zones.slice(0, 4).map(z => String(z.max));
    return ["", "", "", ""];
  };
  const [zoneMaxes, setZoneMaxes] = useState<string[]>(() => initZoneMaxes(initialProfile.customHrZones));
  const [showZoneInputs, setShowZoneInputs] = useState(!!(initialProfile.customHrZones?.length));

  // UI state
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Strava HR import
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<HRImportResult | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [showHRDetails, setShowHRDetails] = useState(false);

  // Sync form when initialProfile changes
  useEffect(() => {
    setMaxHR(initialProfile.maxHR || 0);
    setRestingHR(initialProfile.restingHR || 0);
    setGoal(initialProfile.goal || "");
    setNextRaceDate(initialProfile.nextRaceDate || "");
    setNextRaceDistance(initialProfile.nextRaceDistance || "");
    setTrainingDaysPerWeek(initialProfile.trainingDaysPerWeek || 3);
    setTreadmillPreference(initialProfile.treadmillPreference || "no");
    setInjuryHistory(initialProfile.injuryHistory || "");
    setAiPersonality(initialProfile.aiPersonality || "Supportive Coach");
    setLactateThreshold(initialProfile.lactateThreshold || "");
    setZoneMaxes(initZoneMaxes(initialProfile.customHrZones));
    setShowZoneInputs(!!(initialProfile.customHrZones?.length));
  }, [initialProfile]);

  // Reset status when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setSaved(false);
      setSaveError(null);
      setImportResult(null);
      setImportError(null);
      setShowHRDetails(false);
    }
  }, [isOpen]);

  // ── Strava HR import ──────────────────────────────────────
  const handleImportFromStrava = async () => {
    setImporting(true);
    setImportError(null);
    setImportResult(null);

    try {
      const res = await fetch("/api/strava/hr-zones");
      if (!res.ok) throw new Error("Kunne ikke hente data fra Strava");
      const data: HRImportResult = await res.json();
      setImportResult(data);

      // Auto-fill maxHR
      if (data.bestMaxHR && data.bestMaxHR > 0) {
        setMaxHR(data.bestMaxHR);
      }
      // Auto-fill custom zones if Strava returned them
      if (data.stravaZones && data.stravaZones.length >= 5) {
        setZoneMaxes(data.stravaZones.slice(0, 4).map((z: { min: number; max: number }) => String(z.max)));
        setShowZoneInputs(true);
      }
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Feil ved import");
    } finally {
      setImporting(false);
    }
  };

  // ── Save to Supabase ──────────────────────────────────────
  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    setSaved(false);

    try {
      // Build custom zones array if user has filled them in
      const parsedZoneMaxes = zoneMaxes.map(v => parseInt(v) || 0);
      const zonesComplete = parsedZoneMaxes.every(v => v > 0) && maxHR > 0;
      const customHrZones = zonesComplete ? [
        { min: 0,                    max: parsedZoneMaxes[0] },
        { min: parsedZoneMaxes[0]+1, max: parsedZoneMaxes[1] },
        { min: parsedZoneMaxes[1]+1, max: parsedZoneMaxes[2] },
        { min: parsedZoneMaxes[2]+1, max: parsedZoneMaxes[3] },
        { min: parsedZoneMaxes[3]+1, max: maxHR },
      ] : null;

      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxHR: maxHR || 0,
          restingHR: restingHR || 0,
          goal,
          nextRaceDate: nextRaceDate || null,
          nextRaceDistance: nextRaceDistance || null,
          trainingDaysPerWeek,
          treadmillPreference,
          injuryHistory,
          aiPersonality,
          lactateThreshold,
          customHrZones,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Lagring feilet");
      }

      const updated: RunwiseUserProfile = await res.json();
      setSaved(true);
      onSaved?.(updated);

      // Close after short delay so user sees the saved state
      setTimeout(() => onOpenChange(false), 1200);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Noe gikk galt");
    } finally {
      setSaving(false);
    }
  };

  const missingMaxHR = maxHR <= 0;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white sm:max-w-[520px] max-h-[90vh] flex flex-col p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 pt-5 pb-0">
          <DialogTitle className="text-lg font-bold text-white flex items-center gap-2">
            <Dumbbell className="w-5 h-5 text-orange-400" />
            Innstillinger
          </DialogTitle>
        </DialogHeader>

        {/* Scrollable form */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">

          {/* ── Pulssoner ───────────────────────────────── */}
          <section className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Heart className="w-4 h-4 text-red-400" />
              <h3 className="text-sm font-semibold text-slate-200">Puls</h3>
            </div>

            {/* Max HR warning */}
            {missingMaxHR && (
              <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-300">
                  Maks puls er nødvendig for å kalibrere VDOT-kalkulatoren og beregne treningssoner.
                  Importer fra Strava eller legg inn manuelt.
                </p>
              </div>
            )}

            {/* Strava import button */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleImportFromStrava}
              disabled={importing}
              className="w-full bg-orange-500/10 border-orange-500/30 text-orange-300 hover:bg-orange-500/20 hover:text-orange-200"
            >
              {importing ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              {importing ? "Henter fra Strava..." : "Importer maks puls fra Strava"}
            </Button>

            {/* Import result */}
            {importError && (
              <p className="text-xs text-red-400 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {importError}
              </p>
            )}
            {importResult && (
              <div className="bg-slate-800/60 border border-slate-700/50 rounded-lg p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Importert fra Strava
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowHRDetails(!showHRDetails)}
                    className="text-[10px] text-slate-500 hover:text-slate-300 flex items-center gap-0.5"
                  >
                    Detaljer
                    {showHRDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                  </button>
                </div>
                <p className="text-sm text-white">
                  Maks puls satt til <span className="font-bold text-orange-400">{importResult.bestMaxHR ?? "—"}</span> bpm
                </p>
                {showHRDetails && (
                  <ul className="text-[11px] text-slate-400 space-y-0.5 pt-1 border-t border-slate-700/50">
                    {importResult.athleteMaxHR && (
                      <li>Strava-profil: {importResult.athleteMaxHR} bpm</li>
                    )}
                    {importResult.detectedMaxHR && (
                      <li>Høyeste registrert ({importResult.activitiesScanned} aktiviteter): {importResult.detectedMaxHR} bpm</li>
                    )}
                    {importResult.stravaZones && (
                      <li>
                        Strava-soner:{" "}
                        {importResult.stravaZones.map((z, i) =>
                          `Z${i + 1}: ${z.min}–${z.max}`
                        ).join(", ")}
                      </li>
                    )}
                  </ul>
                )}
              </div>
            )}

            {/* Manual entry */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="maxHR" className="text-xs text-slate-400">
                  Maks puls (bpm) <span className="text-orange-400">*</span>
                </Label>
                <Input
                  id="maxHR"
                  type="number"
                  min={100}
                  max={230}
                  value={maxHR || ""}
                  onChange={(e) => setMaxHR(parseInt(e.target.value) || 0)}
                  placeholder="f.eks. 185"
                  className="bg-slate-800 border-slate-600 text-white h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="restingHR" className="text-xs text-slate-400">
                  Hvilepuls (bpm)
                </Label>
                <Input
                  id="restingHR"
                  type="number"
                  min={30}
                  max={100}
                  value={restingHR || ""}
                  onChange={(e) => setRestingHR(parseInt(e.target.value) || 0)}
                  placeholder="f.eks. 55"
                  className="bg-slate-800 border-slate-600 text-white h-9"
                />
              </div>
            </div>

            {/* Custom HR zones */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setShowZoneInputs(v => !v)}
                className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1"
              >
                {showZoneInputs ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                Egendefinerte pulssoner {showZoneInputs ? "(skjul)" : "(fra Strava eller manuelt)"}
              </button>
              {showZoneInputs && (
                <div className="space-y-2 p-3 bg-slate-800/60 border border-slate-700/50 rounded-lg">
                  <p className="text-[11px] text-slate-400">
                    Skriv inn øvre grense (maks bpm) for sone 1–4. Sone 5 settes automatisk til maks puls.
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {["Sone 1", "Sone 2", "Sone 3", "Sone 4"].map((label, i) => (
                      <div key={i} className="space-y-1">
                        <Label className="text-[11px] text-slate-500">{label} maks</Label>
                        <Input
                          type="number"
                          min={60}
                          max={220}
                          value={zoneMaxes[i]}
                          onChange={e => setZoneMaxes(prev => {
                            const next = [...prev];
                            next[i] = e.target.value;
                            return next;
                          })}
                          placeholder="bpm"
                          className="bg-slate-900 border-slate-600 text-white h-8 text-xs"
                        />
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Sone 5: {zoneMaxes[3] ? `${parseInt(zoneMaxes[3])+1}` : "—"}–{maxHR > 0 ? maxHR : "—"} bpm
                  </p>
                  {zoneMaxes.some(v => v) && (
                    <button
                      type="button"
                      onClick={() => { setZoneMaxes(["", "", "", ""]); setShowZoneInputs(false); }}
                      className="text-[11px] text-red-400 hover:text-red-300"
                    >
                      Nullstill soner (bruk beregnet fra maks puls)
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="lactateThreshold" className="text-xs text-slate-400">
                Laktatterskel (valgfri)
              </Label>
              <Input
                id="lactateThreshold"
                value={lactateThreshold}
                onChange={(e) => setLactateThreshold(e.target.value)}
                placeholder="f.eks. 172 bpm eller 4:15/km — la stå tom hvis ukjent"
                className="bg-slate-800 border-slate-600 text-white h-9"
              />
            </div>
          </section>

          {/* Divider */}
          <div className="border-t border-slate-800" />

          {/* ── Mål og løp ────────────────────────────── */}
          <section className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Target className="w-4 h-4 text-blue-400" />
              <h3 className="text-sm font-semibold text-slate-200">Mål og neste løp</h3>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="goal" className="text-xs text-slate-400">
                Treningsm̊al <span className="text-orange-400">*</span>
              </Label>
              <Input
                id="goal"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="f.eks. Sub 4:00 maraton, 5K under 25 min"
                className="bg-slate-800 border-slate-600 text-white h-9"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="nextRaceDate" className="text-xs text-slate-400">Neste konkurransedato</Label>
                <Input
                  id="nextRaceDate"
                  type="date"
                  value={nextRaceDate}
                  onChange={(e) => setNextRaceDate(e.target.value)}
                  className="bg-slate-800 border-slate-600 text-white h-9"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nextRaceDistance" className="text-xs text-slate-400">Distanse</Label>
                <select
                  id="nextRaceDistance"
                  value={nextRaceDistance}
                  onChange={(e) => setNextRaceDistance(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-1 text-sm text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500"
                >
                  <option value="">Velg...</option>
                  <option value="5km">5 km</option>
                  <option value="10km">10 km</option>
                  <option value="halvmaraton">Halvmaraton</option>
                  <option value="maraton">Maraton</option>
                  <option value="annet">Annet</option>
                </select>
              </div>
            </div>
          </section>

          {/* Divider */}
          <div className="border-t border-slate-800" />

          {/* ── Treningspreferanser ────────────────────── */}
          <section className="space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Dumbbell className="w-4 h-4 text-purple-400" />
              <h3 className="text-sm font-semibold text-slate-200">Treningspreferanser</h3>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Treningsdager per uke</Label>
              <div className="flex gap-2">
                {[2, 3, 4, 5, 6, 7].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setTrainingDaysPerWeek(n)}
                    className={`flex-1 h-9 rounded-md text-sm font-medium transition-colors ${
                      trainingDaysPerWeek === n
                        ? "bg-orange-500 text-white"
                        : "bg-slate-800 border border-slate-600 text-slate-400 hover:bg-slate-700"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-slate-400">Tredemølle</Label>
              <div className="flex gap-2">
                {(["no", "sometimes", "yes"] as const).map((val) => {
                  const labels = { no: "Aldri", sometimes: "Av og til", yes: "Alltid" };
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setTreadmillPreference(val)}
                      className={`flex-1 h-9 rounded-md text-sm font-medium transition-colors ${
                        treadmillPreference === val
                          ? "bg-orange-500 text-white"
                          : "bg-slate-800 border border-slate-600 text-slate-400 hover:bg-slate-700"
                      }`}
                    >
                      {labels[val]}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="aiPersonality" className="text-xs text-slate-400">AI-trener personlighet</Label>
              <select
                id="aiPersonality"
                value={aiPersonality}
                onChange={(e) => setAiPersonality(e.target.value)}
                className="flex h-9 w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-1 text-sm text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-orange-500"
              >
                <option value="Supportive Coach">Støttende og motiverende</option>
                <option value="Strict Drill Sergeant">Streng og direkte</option>
                <option value="Data-Driven Physiologist">Datadrevet fysiolog</option>
                <option value="Elite Pro Runner">Elitetrenerperspektiv</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="injuryHistory" className="text-xs text-slate-400">
                Skadehistorikk / merknader
              </Label>
              <Textarea
                id="injuryHistory"
                value={injuryHistory}
                onChange={(e) => setInjuryHistory(e.target.value)}
                placeholder="f.eks. Tendens til skinnleggsplager, IT-band-problemer..."
                className="bg-slate-800 border-slate-600 text-white resize-none text-sm"
                rows={3}
              />
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/50 flex items-center gap-3">
          {saveError && (
            <p className="text-xs text-red-400 flex-1">{saveError}</p>
          )}
          {saved && (
            <p className="text-xs text-emerald-400 flex items-center gap-1 flex-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> Lagret!
            </p>
          )}
          <div className="flex gap-2 ml-auto">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-slate-400 hover:text-white"
              disabled={saving}
            >
              Avbryt
            </Button>
            <Button
              type="button"
              onClick={handleSave}
              disabled={saving || !goal.trim()}
              className="bg-orange-500 hover:bg-orange-600 text-white"
              size="sm"
            >
              {saving ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
              ) : (
                <Save className="w-4 h-4 mr-1.5" />
              )}
              {saving ? "Lagrer..." : "Lagre"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Legacy compatibility exports for dashboard-client.tsx ────
// Dashboard still uses localStorage-based profile. Keep these
// to avoid breaking the existing Nerd Mode / dashboard page.

export interface UserProfile {
  maxHR: number;
  restingHR: number;
  lactateThreshold: string;
  goal: string;
  injuryHistory: string;
  aiPersonality?: string;
}

export const DEFAULT_PROFILE: UserProfile = {
  maxHR: 0,
  restingHR: 0,
  lactateThreshold: "",
  goal: "",
  injuryHistory: "",
  aiPersonality: "Supportive Coach",
};

const STORAGE_KEY = "runprompt-user-profile";

export function hasStoredProfile(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

export function loadProfileFromStorage(): UserProfile {
  if (typeof window === "undefined") return DEFAULT_PROFILE;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return JSON.parse(stored);
  } catch {
    // ignore
  }
  return DEFAULT_PROFILE;
}

export function saveProfileToStorage(profile: UserProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // ignore
  }
}

/**
 * LegacySettingsDialog — used by dashboard-client.tsx (Nerd Mode / legacy).
 * Keeps the old localStorage-based API so dashboard doesn't need refactoring.
 */
interface LegacySettingsDialogProps {
  profile: UserProfile;
  onSave: (profile: UserProfile) => void;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  isFirstTimeUser?: boolean;
}

export function LegacySettingsDialog({
  profile,
  onSave,
  isOpen,
  onOpenChange,
}: LegacySettingsDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [formData, setFormData] = useState<UserProfile>(profile);

  const open = isOpen !== undefined ? isOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;

  useEffect(() => { setFormData(profile); }, [profile]);

  const handleSave = () => {
    saveProfileToStorage(formData);
    onSave(formData);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="bg-slate-900 border-slate-700 text-white sm:max-w-[500px] max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-0">
          <DialogTitle className="text-lg font-bold text-white">Innstillinger (Nerd Mode)</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="lMaxHR" className="text-xs text-slate-400">Maks puls (bpm)</Label>
              <Input id="lMaxHR" type="number" value={formData.maxHR || ""} onChange={e => setFormData({ ...formData, maxHR: parseInt(e.target.value) || 0 })} placeholder="185" className="bg-slate-800 border-slate-600 text-white h-9" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lRestHR" className="text-xs text-slate-400">Hvilepuls (bpm)</Label>
              <Input id="lRestHR" type="number" value={formData.restingHR || ""} onChange={e => setFormData({ ...formData, restingHR: parseInt(e.target.value) || 0 })} placeholder="55" className="bg-slate-800 border-slate-600 text-white h-9" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lGoal" className="text-xs text-slate-400">Treningsmål</Label>
            <Input id="lGoal" value={formData.goal} onChange={e => setFormData({ ...formData, goal: e.target.value })} placeholder="Sub 3:30 maraton" className="bg-slate-800 border-slate-600 text-white h-9" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lInjury" className="text-xs text-slate-400">Skadehistorikk</Label>
            <Textarea id="lInjury" value={formData.injuryHistory} onChange={e => setFormData({ ...formData, injuryHistory: e.target.value })} className="bg-slate-800 border-slate-600 text-white resize-none text-sm" rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lPersonality" className="text-xs text-slate-400">AI-trener personlighet</Label>
            <select id="lPersonality" value={formData.aiPersonality || "Supportive Coach"} onChange={e => setFormData({ ...formData, aiPersonality: e.target.value })} className="flex h-9 w-full rounded-md border border-slate-600 bg-slate-800 px-3 py-1 text-sm text-white focus-visible:outline-none">
              <option value="Supportive Coach">Supportive &amp; Encouraging</option>
              <option value="Strict Drill Sergeant">Strict Drill Sergeant</option>
              <option value="Data-Driven Physiologist">Data-Driven Physiologist</option>
              <option value="Elite Pro Runner">Elite Pro Runner</option>
            </select>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-900/50 flex justify-end">
          <Button onClick={handleSave} className="bg-orange-500 hover:bg-orange-600 text-white" size="sm">
            <Save className="w-4 h-4 mr-1.5" />
            Lagre
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
