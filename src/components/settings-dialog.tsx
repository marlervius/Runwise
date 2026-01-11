"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Settings, Save, AlertCircle, Sparkles } from "lucide-react";

export interface UserProfile {
  maxHR: number;
  restingHR: number;
  lactateThreshold: string;
  goal: string;
  injuryHistory: string;
}

export const DEFAULT_PROFILE: UserProfile = {
  maxHR: 0,
  restingHR: 0,
  lactateThreshold: "",
  goal: "",
  injuryHistory: "",
};

const STORAGE_KEY = "runprompt-user-profile";

export function hasStoredProfile(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored !== null;
  } catch {
    return false;
  }
}

export function loadProfileFromStorage(): UserProfile {
  if (typeof window === "undefined") return DEFAULT_PROFILE;
  
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.error("Error loading profile from localStorage:", e);
  }
  return DEFAULT_PROFILE;
}

export function saveProfileToStorage(profile: UserProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch (e) {
    console.error("Error saving profile to localStorage:", e);
  }
}

interface SettingsDialogProps {
  profile: UserProfile;
  onSave: (profile: UserProfile) => void;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  isFirstTimeUser?: boolean;
}

export function SettingsDialog({ 
  profile, 
  onSave, 
  isOpen, 
  onOpenChange,
  isFirstTimeUser = false 
}: SettingsDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [formData, setFormData] = useState<UserProfile>(profile);

  // Use external control if provided, otherwise internal
  const open = isOpen !== undefined ? isOpen : internalOpen;
  const setOpen = onOpenChange || setInternalOpen;

  useEffect(() => {
    setFormData(profile);
  }, [profile]);

  const handleSave = () => {
    saveProfileToStorage(formData);
    onSave(formData);
    setOpen(false);
  };

  // Check if profile is incomplete
  const isIncomplete = formData.maxHR === 0 || !formData.goal;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className="bg-slate-800 border-slate-700 hover:bg-slate-700">
          <Settings className="h-5 w-5 text-slate-300" />
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-slate-900 border-slate-700 text-white sm:max-w-[500px] max-h-[90vh] flex flex-col p-0 overflow-hidden">
        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar">
          <DialogHeader className="mb-4">
            <DialogTitle className="text-xl flex items-center gap-2">
              {isFirstTimeUser && <Sparkles className="w-5 h-5 text-amber-400" />}
              {isFirstTimeUser ? "Welcome to RunPrompt!" : "Runner Profile Settings"}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {isFirstTimeUser 
                ? "Let's set up your profile for personalized AI coaching."
                : "Customize your profile for more personalized AI coaching feedback."
              }
            </DialogDescription>
          </DialogHeader>

          {/* First-time user welcome banner */}
          {isFirstTimeUser && (
            <div className="flex items-start gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg mb-6">
              <AlertCircle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-200">
                <p className="font-medium mb-1">To give you accurate coaching, the AI needs to know your physiology.</p>
                <p className="text-amber-300/80">If you don't know a value (like Lactate Threshold), leave it empty or enter 0 – the AI will estimate it for you based on your data.</p>
              </div>
            </div>
          )}
          
          <div className="grid gap-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="maxHR" className="text-slate-300">
                  Max Heart Rate (bpm)
                  <span className="text-red-400 ml-1">*</span>
                </Label>
                <Input
                  id="maxHR"
                  type="number"
                  value={formData.maxHR || ""}
                  onChange={(e) => setFormData({ ...formData, maxHR: parseInt(e.target.value) || 0 })}
                  placeholder="e.g., 185"
                  className="bg-slate-800 border-slate-600 text-white"
                />
                <p className="text-xs text-slate-500">Enter 0 if unknown – AI will estimate</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="restingHR" className="text-slate-300">Resting Heart Rate (bpm)</Label>
                <Input
                  id="restingHR"
                  type="number"
                  value={formData.restingHR || ""}
                  onChange={(e) => setFormData({ ...formData, restingHR: parseInt(e.target.value) || 0 })}
                  placeholder="e.g., 55"
                  className="bg-slate-800 border-slate-600 text-white"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="lactateThreshold" className="text-slate-300">Lactate Threshold</Label>
              <Input
                id="lactateThreshold"
                value={formData.lactateThreshold}
                onChange={(e) => setFormData({ ...formData, lactateThreshold: e.target.value })}
                placeholder="e.g., 172 bpm (4:15/km) or leave empty"
                className="bg-slate-800 border-slate-600 text-white"
              />
              <p className="text-xs text-slate-500">
                💡 Leave empty if unknown. The AI will estimate it from your pace/HR data.
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="goal" className="text-slate-300">
                Running Goal
                <span className="text-red-400 ml-1">*</span>
              </Label>
              <Input
                id="goal"
                value={formData.goal}
                onChange={(e) => setFormData({ ...formData, goal: e.target.value })}
                placeholder="e.g., Sub 3:30 Marathon, Run 5K without stopping"
                className="bg-slate-800 border-slate-600 text-white"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="injuryHistory" className="text-slate-300">Injury History / Notes</Label>
              <Textarea
                id="injuryHistory"
                value={formData.injuryHistory}
                onChange={(e) => setFormData({ ...formData, injuryHistory: e.target.value })}
                placeholder="e.g., Tendency for shin splints, recovering from IT band issues"
                className="bg-slate-800 border-slate-600 text-white resize-none"
                rows={3}
              />
            </div>
          </div>
        </div>
        
        <DialogFooter className="p-6 pt-2 border-t border-slate-800 flex-col sm:flex-row gap-2 bg-slate-900/50">
          {isIncomplete && (
            <p className="text-xs text-amber-400 mr-auto self-center mb-2 sm:mb-0">
              * Please fill in at least Max HR and Goal
            </p>
          )}
          <Button 
            onClick={handleSave} 
            className="bg-purple-600 hover:bg-purple-700 w-full sm:w-auto"
            disabled={isFirstTimeUser && isIncomplete}
          >
            <Save className="w-4 h-4 mr-2" />
            {isFirstTimeUser ? "Get Started" : "Save Profile"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
