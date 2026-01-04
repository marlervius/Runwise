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
import { Settings, Save } from "lucide-react";

export interface UserProfile {
  maxHR: number;
  restingHR: number;
  lactateThreshold: string;
  goal: string;
  injuryHistory: string;
}

export const DEFAULT_PROFILE: UserProfile = {
  maxHR: 195,
  restingHR: 50,
  lactateThreshold: "172 bpm (4:15/km)",
  goal: "Sub 3:30 Marathon",
  injuryHistory: "None",
};

const STORAGE_KEY = "runprompt-user-profile";

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
}

export function SettingsDialog({ profile, onSave }: SettingsDialogProps) {
  const [open, setOpen] = useState(false);
  const [formData, setFormData] = useState<UserProfile>(profile);

  useEffect(() => {
    setFormData(profile);
  }, [profile]);

  const handleSave = () => {
    saveProfileToStorage(formData);
    onSave(formData);
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="icon" className="bg-slate-800 border-slate-700 hover:bg-slate-700">
          <Settings className="h-5 w-5 text-slate-300" />
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-slate-900 border-slate-700 text-white sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="text-xl">Runner Profile Settings</DialogTitle>
          <DialogDescription className="text-slate-400">
            Customize your profile for more personalized AI coaching feedback.
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="maxHR" className="text-slate-300">Max Heart Rate (bpm)</Label>
              <Input
                id="maxHR"
                type="number"
                value={formData.maxHR}
                onChange={(e) => setFormData({ ...formData, maxHR: parseInt(e.target.value) || 0 })}
                className="bg-slate-800 border-slate-600 text-white"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="restingHR" className="text-slate-300">Resting Heart Rate (bpm)</Label>
              <Input
                id="restingHR"
                type="number"
                value={formData.restingHR}
                onChange={(e) => setFormData({ ...formData, restingHR: parseInt(e.target.value) || 0 })}
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
              placeholder="e.g., 172 bpm (4:15/km)"
              className="bg-slate-800 border-slate-600 text-white"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="goal" className="text-slate-300">Running Goal</Label>
            <Input
              id="goal"
              value={formData.goal}
              onChange={(e) => setFormData({ ...formData, goal: e.target.value })}
              placeholder="e.g., Sub 3:30 Marathon"
              className="bg-slate-800 border-slate-600 text-white"
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="injuryHistory" className="text-slate-300">Injury History / Notes</Label>
            <Textarea
              id="injuryHistory"
              value={formData.injuryHistory}
              onChange={(e) => setFormData({ ...formData, injuryHistory: e.target.value })}
              placeholder="e.g., Tendency for shin splints on high volume"
              className="bg-slate-800 border-slate-600 text-white resize-none"
              rows={3}
            />
          </div>
        </div>
        
        <DialogFooter>
          <Button onClick={handleSave} className="bg-purple-600 hover:bg-purple-700">
            <Save className="w-4 h-4 mr-2" />
            Save Profile
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
