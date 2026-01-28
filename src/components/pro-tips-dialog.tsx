"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Lightbulb, Heart, Watch, Zap, ChevronRight } from "lucide-react"

export function ProTipsDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="ghost" className="text-amber-400 hover:text-amber-300 hover:bg-amber-950/30 gap-2">
          <Lightbulb className="w-5 h-5" />
          <span className="hidden sm:inline">Pro Tips</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl bg-slate-950 border-slate-800 text-slate-100 max-h-[90vh] flex flex-col p-0 overflow-hidden">
        {/* Fixed Header */}
        <DialogHeader className="p-6 pb-4 border-b border-slate-800 flex-shrink-0">
          <DialogTitle className="text-2xl font-bold flex items-center gap-2 text-amber-400">
            <Lightbulb className="w-6 h-6" />
            Optimize Your Data for AI
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            Better data in = Better coaching out. Follow these tips to get the most accurate analysis.
          </DialogDescription>
        </DialogHeader>

        {/* Scrollable Content */}
        <div className="overflow-y-auto flex-1 p-6 pt-4">
          <div className="space-y-6">
            {/* Tip 1: Heart Rate */}
            <div className="flex gap-4 p-4 rounded-lg bg-slate-900/50 border border-slate-800">
              <div className="mt-1 bg-red-500/10 p-2 rounded-full h-fit">
                <Heart className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-1">Use a Chest Strap</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  Wrist-based monitors often &quot;lag&quot; during intervals. For the AI to correctly calculate your 
                  <strong className="text-slate-200"> Cardiac Drift</strong> and <strong className="text-slate-200">Threshold</strong>, a chest strap (like Garmin HRM or Polar) 
                  provides the medical-grade accuracy needed.
                </p>
              </div>
            </div>

            {/* Tip 2: Laps */}
            <div className="flex gap-4 p-4 rounded-lg bg-slate-900/50 border border-slate-800">
              <div className="mt-1 bg-blue-500/10 p-2 rounded-full h-fit">
                <Watch className="w-5 h-5 text-blue-500" />
              </div>
              <div>
                <h3 className="font-semibold text-lg mb-1">Master the &quot;Lap&quot; Button</h3>
                <p className="text-slate-400 text-sm leading-relaxed">
                  For interval sessions, <strong className="text-slate-200">Auto-Lap (every 1km) destroys data context</strong>. 
                  The AI needs to distinguish between &quot;Work&quot; and &quot;Rest&quot;. 
                  Always press the Lap button manually when starting and finishing an interval.
                </p>
              </div>
            </div>

            {/* Tip 3: Garmin Guide */}
            <div className="border border-amber-900/30 bg-amber-950/10 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-3 text-amber-400 font-semibold">
                <Zap className="w-4 h-4" />
                How to disable Auto-Lap on Garmin
              </div>
              <ul className="space-y-3 text-sm text-slate-300">
                <li className="flex items-start gap-2">
                  <span className="bg-slate-800 text-slate-400 w-5 h-5 flex items-center justify-center rounded-full text-xs mt-0.5 flex-shrink-0">1</span>
                  <span>Long press <strong className="text-slate-100">Up/Menu</strong> (Middle Left Button)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="bg-slate-800 text-slate-400 w-5 h-5 flex items-center justify-center rounded-full text-xs mt-0.5 flex-shrink-0">2</span>
                  <span>Select <strong className="text-slate-100">Activities & Apps</strong> <ChevronRight className="w-3 h-3 inline" /> <strong className="text-slate-100">Run</strong></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="bg-slate-800 text-slate-400 w-5 h-5 flex items-center justify-center rounded-full text-xs mt-0.5 flex-shrink-0">3</span>
                  <span>Select <strong className="text-slate-100">Run Settings</strong> <ChevronRight className="w-3 h-3 inline" /> <strong className="text-slate-100">Laps</strong></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="bg-slate-800 text-slate-400 w-5 h-5 flex items-center justify-center rounded-full text-xs mt-0.5 flex-shrink-0">4</span>
                  <span>Set <strong className="text-slate-100">Auto Lap</strong> to <span className="text-red-400 font-bold">OFF</span></span>
                </li>
              </ul>
              <div className="mt-4 pt-3 border-t border-amber-900/20">
                <p className="text-xs text-amber-300/70">
                  💡 <strong>Pro Tip:</strong> Use the <strong>Back/Lap</strong> button (Bottom Right) to mark the start/end of each interval.
                </p>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
