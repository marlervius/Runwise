"use client";

import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Activity, BarChart3, Settings, LogOut } from "lucide-react";

interface AppHeaderProps {
  showNerdMode?: boolean;
  onSettingsClick?: () => void;
}

export function AppHeader({ showNerdMode = true, onSettingsClick }: AppHeaderProps) {
  const router = useRouter();

  return (
    <header className="flex items-center justify-between px-4 py-3 bg-slate-900/80 border-b border-slate-700/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center">
          <Activity className="w-4 h-4 text-white" />
        </div>
        <span className="text-lg font-bold text-white">
          Run<span className="text-orange-500">wise</span>
        </span>
      </div>

      <div className="flex items-center gap-1">
        {showNerdMode && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/dashboard")}
            className="text-slate-400 hover:text-white hover:bg-slate-800"
            title="Nerd Mode"
          >
            <BarChart3 className="w-5 h-5" />
          </Button>
        )}
        {onSettingsClick && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onSettingsClick}
            className="text-slate-400 hover:text-white hover:bg-slate-800"
            title="Innstillinger"
          >
            <Settings className="w-5 h-5" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => signOut({ callbackUrl: "/" })}
          className="text-slate-400 hover:text-white hover:bg-slate-800"
          title="Logg ut"
        >
          <LogOut className="w-5 h-5" />
        </Button>
      </div>
    </header>
  );
}
