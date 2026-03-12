"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Activity, CalendarDays, Brain, ArrowRight } from "lucide-react";

export default function LandingPage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") {
      router.push("/onboarding");
    }
  }, [status, router]);

  const handleLogin = () => {
    signIn("strava", { callbackUrl: "/onboarding" });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiNmZmZmZmYiIGZpbGwtb3BhY2l0eT0iMC4wMyI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />

      {/* Gradient Orbs */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-orange-500/20 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />

      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4">
        {/* Logo & Title */}
        <div className="text-center mb-12 animate-fade-in">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-orange-500 to-orange-600 shadow-lg shadow-orange-500/30 mb-6">
            <Activity className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-4 tracking-tight">
            Run<span className="text-orange-500">wise</span>
          </h1>
          <p className="text-xl text-white/70 max-w-md mx-auto leading-relaxed">
            Din personlige AI-drevne løpetrener — alltid tilgjengelig, alltid oppdatert
          </p>
        </div>

        {/* Feature Cards */}
        <div className="grid md:grid-cols-3 gap-4 mb-12 max-w-3xl w-full">
          <Card className="bg-white/5 border-white/10 backdrop-blur-sm hover:bg-white/10 transition-colors">
            <CardContent className="p-6 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-orange-500/20 mb-4">
                <Activity className="w-6 h-6 text-orange-400" />
              </div>
              <h3 className="text-white font-semibold mb-2">Koble til Strava</h3>
              <p className="text-white/60 text-sm">
                Ett klikk — vi leser din treningshistorikk og forstår deg
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10 backdrop-blur-sm hover:bg-white/10 transition-colors">
            <CardContent className="p-6 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-purple-500/20 mb-4">
                <CalendarDays className="w-6 h-6 text-purple-400" />
              </div>
              <h3 className="text-white font-semibold mb-2">Personlig treningsplan</h3>
              <p className="text-white/60 text-sm">
                AI-generert ukentlig plan som tilpasser seg livet ditt
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white/5 border-white/10 backdrop-blur-sm hover:bg-white/10 transition-colors">
            <CardContent className="p-6 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-500/20 mb-4">
                <Brain className="w-6 h-6 text-emerald-400" />
              </div>
              <h3 className="text-white font-semibold mb-2">Daglig tilpasning</h3>
              <p className="text-white/60 text-sm">
                Fortell oss hvordan du føler deg — vi justerer dagens økt
              </p>
            </CardContent>
          </Card>
        </div>

        {/* CTA Button */}
        <Button
          onClick={handleLogin}
          size="lg"
          className="bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-semibold px-8 py-6 text-lg rounded-xl shadow-lg shadow-orange-500/30 transition-all hover:scale-105 hover:shadow-xl hover:shadow-orange-500/40"
        >
          <svg className="w-6 h-6 mr-3" viewBox="0 0 24 24" fill="currentColor">
            <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066l-2.084 4.116z" />
            <path d="M7.17 0L0 14.223h3.708l7.169-14.223h-3.707z" opacity="0.6" />
            <path d="M13.28 0L6.11 14.223h3.708L16.988 0H13.28z" />
          </svg>
          Koble til Strava
          <ArrowRight className="w-5 h-5 ml-2" />
        </Button>

        <p className="mt-4 text-white/50 text-sm max-w-sm text-center">
          En trener som kjenner deg — for prisen av en kopp kaffe i måneden
        </p>

        <p className="mt-8 text-white/40 text-sm">
          Dine data er trygge. Vi leser kun dine aktiviteter.
        </p>
      </div>
    </div>
  );
}
