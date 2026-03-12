import { RunwiseUserProfile, WeeklyPlanDay, WeeklyPlan } from "@/types/runwise";
import {
  ACWRMetrics,
  DanielsTrainingPaces,
  WeeklyVolume,
  ConsistencyMetrics,
  PeriodizationContext,
  MissedTrainingAnalysis,
  SpikeRisk,
} from "@/lib/metrics";
import { buildCoachingContext, RaceDistance } from "@/lib/ai/coaching-database";

export function buildWeeklyPlanPrompt(context: {
  profile: RunwiseUserProfile;
  vdot: number;
  danielsPaces: DanielsTrainingPaces | null;
  acwr: ACWRMetrics | null;
  weeklyVolumes: WeeklyVolume[];
  consistencyMetrics: ConsistencyMetrics;
  lastWeekPlan?: WeeklyPlan;
  weekStartDate: string;
  daysOfWeek: string[];
  hrZones?: { zone: string; min: number; max: number }[];
  periodization?: PeriodizationContext;
  missedTraining?: MissedTrainingAnalysis;
  spikeRisk?: SpikeRisk;
  weeklyVolumeKm?: number;
}): string {
  const {
    profile,
    vdot,
    danielsPaces,
    acwr,
    weeklyVolumes,
    consistencyMetrics,
    lastWeekPlan,
    weekStartDate,
    daysOfWeek,
    hrZones,
    periodization,
    missedTraining,
    spikeRisk,
  } = context;

  const raceInfo = profile.nextRaceDate && profile.nextRaceDistance
    ? `Neste løp: ${profile.nextRaceDistance} den ${profile.nextRaceDate}`
    : "Ingen planlagt løp";

  const paceInfo = danielsPaces
    ? `Treningspaces (Daniels): E: ${danielsPaces.easy} | M: ${danielsPaces.marathon} | T: ${danielsPaces.threshold} | I: ${danielsPaces.interval} | R: ${danielsPaces.repetition}`
    : "Treningspaces ikke tilgjengelig";

  const hrZoneInfo = hrZones && hrZones.length > 0
    ? `Pulssoner (basert på faktisk maks-puls ${profile.maxHR} bpm):\n${hrZones.map(z => `  ${z.zone}: ${z.min}-${z.max} bpm`).join("\n")}`
    : "Pulssoner: Ikke tilgjengelig";

  const acwrInfo = acwr
    ? `ACWR: ${acwr.ratio.toFixed(2)} (${acwr.status}) — Akutt: ${acwr.acuteLoad.toFixed(1)}km, Kronisk: ${acwr.chronicLoad.toFixed(1)}km/uke`
    : "ACWR: Ikke nok data";

  // HARD ACWR-grense — advarselen håndheves algoritmisk, ikke bare i tekst
  const acwrWarning = acwr && acwr.ratio > 1.30
    ? `\n⚠️ ACWR ADVARSEL: Ratio ${acwr.ratio.toFixed(2)} — ${acwr.ratio > 1.50
        ? "FARESONEN (>1.50): Absolutt forbud mot nye harde intervalløkter. Reduser ukevolum med minst 20%. Kun rolige og moderate økter."
        : "VARSELSONE (1.31-1.50): Ingen nye harde kvalitetsøkter. Bevar eksisterende volum, men øk det ikke."}`
    : "";

  const volumeHistory = weeklyVolumes.length > 0
    ? weeklyVolumes.map(w => `${w.weekLabel}: ${w.km.toFixed(1)}km (${w.sessions} økter)`).join("\n")
    : "Ingen historikk";

  const lastWeekInfo = lastWeekPlan
    ? `Forrige uke: ${lastWeekPlan.totalVolumeKm.toFixed(1)}km total, ${lastWeekPlan.hardDayCount} harde dager`
    : "Ingen forrige ukeplan";

  // Periodiseringsinfo
  const periodInfo = periodization
    ? `\nTREINGSFASE: ${periodization.phaseNorwegian} (${periodization.phase})
- ${periodization.weeksToRace !== null ? `${periodization.weeksToRace} uker til løpet` : "Ingen planlagt konkurranse"}
- Volumguideline: ${periodization.volumeGuideline}
- Intensitetsguideline: ${periodization.intensityGuideline}
- Fokus: ${periodization.focusDescription}`
    : "";

  // Tapt-trenings-analyse
  const missedInfo = missedTraining && missedTraining.level !== "none"
    ? `\nTAPT TRENING: ${missedTraining.consecutiveRestDays} dager uten løping (nivå: ${missedTraining.level})
- ${missedTraining.recommendation}
- Anbefalt volumfaktor: ${(missedTraining.volumeFactor * 100).toFixed(0)}% av normalt
${missedTraining.vdotAdjustmentPct > 0 ? `- VDOT justeres ned ${missedTraining.vdotAdjustmentPct.toFixed(1)}% pga. fysiologisk forfall` : ""}
${missedTraining.easyOnlyDays > 0 ? `- VIKTIG: Kun rolige E-sone-løp de første ${missedTraining.easyOnlyDays} dagene i planen` : ""}`
    : "";

  // Spike-risiko
  const spikeInfo = spikeRisk && spikeRisk.longestRunLast30Days > 0
    ? `\nLANGTUR-GRENSE (10%-regelen): Lengste løpetur siste 30 dager: ${spikeRisk.longestRunLast30Days}km → Maks enkeltøkt i planen: ${spikeRisk.safeMaxSingleRun}km. Ikke sett opp langturer over denne grensen.`
    : "";

  const dayNames = ["Søndag", "Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag"];

  // Effektiv VDOT etter eventuelle justeringer
  const effectiveVdot = missedTraining && missedTraining.vdotAdjustmentPct > 0
    ? vdot * (1 - missedTraining.vdotAdjustmentPct / 100)
    : vdot;

  // Bestem coachingkontekst basert på profil og periodisering
  const recentAvgKm = context.weeklyVolumeKm
    ?? (weeklyVolumes.length > 0
      ? weeklyVolumes.reduce((s, w) => s + w.km, 0) / weeklyVolumes.length
      : 0);
  const raceDistanceKey = ((): RaceDistance => {
    const d = (profile.nextRaceDistance ?? "").toLowerCase();
    if (d.includes("5k") || d.includes("5 km")) return "5k";
    if (d.includes("10k") || d.includes("10 km")) return "10k";
    if (d.includes("halv") || d.includes("half") || d.includes("21")) return "half";
    if (d.includes("maraton") || d.includes("marathon") || d.includes("42")) return "marathon";
    return "general";
  })();
  const weeksToRace = periodization?.weeksToRace ?? null;
  const coachingContext = buildCoachingContext({
    raceDistance: raceDistanceKey,
    weeksToRace,
    weeklyVolumeKm: recentAvgKm,
    trainingDaysPerWeek: profile.trainingDaysPerWeek || 4,
    vdot: effectiveVdot,
  });

  return `Du er en erfaren, varm og personlig løpetrener. Du snakker direkte til løperen — aldri om dem.

TONE OG SPRÅK (følg dette strengt):
- Skriv på norsk, alltid
- ALDRI fagsjargong: ikke "totalbelastning", "aerob terskel", "VO2max-stimulering", "80/20-regelen" eller "ACWR"
- Maks 2 setninger i description-feltet per økt
- description skal svare på "hvorfor akkurat i dag?" — ikke bare hva de skal gjøre
- Tone: varm og direkte, som en trener de stoler på
- Ikke vær overdrevent positiv eller coach-aktig ("Bra jobba!")
- Ikke bruk passiv form: "Det anbefales" → "Hold deg rolig"
- Aldri mer enn én tanke per setning

EKSEMPLER PÅ GOD TONE:
- Rolig tur: "Du har trent jevnt denne uken — i dag holder vi det rolig så kroppen får hente seg inn."
- Intervalløkt: "Hard dag i dag — men det er her du bygger fart. Gi gass på dragene og ta pausene på alvor."
- Langtur: "Langtur i dag. Hold et tempo du kan holde en samtale i — det er jobben, ikke å presse seg."
- Hviledag: "Hvil i dag. Det er ikke latskap — det er en del av planen."
- Terskeløkt: "Ubehagelig, men kontrollert — sånn skal det kjennes. Hold pausen jevn gjennom hele draget."

UTØVERDATA (bruk dette som grunnlag):
- Mål: ${profile.goal || "Generell forbedring"}
- ${raceInfo}
- Treningsdager per uke: ${profile.trainingDaysPerWeek}
- Mølle: ${profile.treadmillPreference === "yes" ? "Ja" : profile.treadmillPreference === "sometimes" ? "Av og til" : "Nei"}
- Max HR: ${profile.maxHR || "Ukjent"} bpm | Hvile-HR: ${profile.restingHR || "Ukjent"} bpm
- VDOT (effektiv): ${effectiveVdot > 0 ? effectiveVdot.toFixed(1) : "Ikke beregnet"}${missedTraining && missedTraining.vdotAdjustmentPct > 0 ? ` (nedjustert ${missedTraining.vdotAdjustmentPct.toFixed(1)}% pga. fravær)` : ""}
- ${paceInfo}
- ${hrZoneInfo}
- Skadehistorikk: ${profile.injuryHistory || "Ingen kjent"}

${coachingContext}

TRENINGSDATA:
- ${acwrInfo}${acwrWarning}
- ${lastWeekInfo}
- Konsistens: ${consistencyMetrics.avgSessionsPerWeek} økter/uke snitt
- Volum siste uker:
${volumeHistory}
${periodInfo}
${missedInfo}
${spikeInfo}

PLANDATOER (14 dager):
${daysOfWeek.map((d) => {
  const jsDay = new Date(d).getDay();
  return `${dayNames[jsDay]} ${d}`;
}).join("\n")}

HARDE REGLER (disse kan IKKE brytes):
1. Bruk ${profile.trainingDaysPerWeek} treningsdager per uke, resten er hviledager
2. Intensitetsfordeling tilpasset treningsfasen — rolig/lett dominerer
3. Aldri to harde dager etter hverandre
4. Maks 10% økning i ukevolum vs forrige uke
5. Langtur helst på lørdag eller søndag${spikeRisk?.safeMaxSingleRun ? ` — ALDRI over ${spikeRisk.safeMaxSingleRun}km` : ""}
6. Bruk utøverens Daniels-paces for paceZone
7. Bruk utøverens faktiske pulssoner for hrZone — IKKE finn på verdier
8. description: 1-2 setninger, norsk, personlig tone som vist i eksemplene
9. ${profile.treadmillPreference === "sometimes" ? "Legg til treadmillVariant for alle treningsdager" : "treadmillVariant ikke nødvendig"}
${acwr && acwr.ratio > 1.50 ? "10. ⛔ Kun rolige og lette løpeturer denne uken — ingen harde drag eller terskeldrag." : ""}
${missedTraining && missedTraining.easyOnlyDays > 0 ? `10. ⛔ Kun rolige løpeturer de første ${missedTraining.easyOnlyDays} dagene — forsiktig oppstart etter pause.` : ""}

TENK STEG FOR STEG — skriv intern analyse i "internal_reasoning":
1. Ukevolum: ${lastWeekPlan ? `forrige uke ${lastWeekPlan.totalVolumeKm.toFixed(1)}km` : "ingen historikk"} → maks ${lastWeekPlan ? Math.round(lastWeekPlan.totalVolumeKm * 1.10) + "km" : "ukjent"} denne uken
2. Treningsbelastning: er det noen begrensninger? (belastningsnivå: ${acwr?.ratio.toFixed(2) ?? "ukjent"})
3. Treningsfase: ${periodization?.phaseNorwegian ?? "Vedlikehold"} — hva betyr det for intensitetsfordelingen?
4. Eventuelle restriksjoner fra pause eller spike-risiko
5. Fordeling av ${profile.trainingDaysPerWeek} treningsdager logisk over 14 dager

Svar med KUN gyldig JSON (ingen annen tekst):
{
  "internal_reasoning": "Din trinnvise analyse her",
  "weekFocus": "1-2 setninger på norsk som oppsummerer hva denne uken handler om for denne løperen — personlig og konkret, ingen fagord. Eks: 'Denne uken bygger vi løpsfundamentet. Rolig og konsistent — det er jobben.'",
  "days": [
    {
      "dayOfWeek": 1,
      "date": "${daysOfWeek[0]}",
      "workoutType": "easy|threshold|interval|long|rest|recovery",
      "workoutTypeNorwegian": "Rolig tur|Terskeløkt|Intervalløkt|Langtur|Hviledag|Restitusjon",
      "durationMinutes": 45,
      "estimatedDistanceKm": 8.0,
      "intensityZone": "Z1-Z2",
      "hrZone": "130-150 bpm",
      "paceZone": "5:30-6:00/km",
      "description": "Personlig begrunnelse på norsk — maks 2 setninger, varm og direkte tone.",
      "structure": [
        { "phase": "Oppvarming", "duration": "10 min", "pace": "6:00–7:00/km", "hrZone": "Z1–Z2" },
        { "phase": "Hoveddel", "duration": "25 min", "pace": "5:30–6:00/km", "hrZone": "Z2", "note": "Hold jevn innsats" },
        { "phase": "Nedkjøling", "duration": "10 min", "pace": "6:30–7:00/km", "hrZone": "Z1" }
      ],
      "treadmillVariant": "Mølle-beskrivelse hvis aktuelt (ellers utelat feltet)",
      "isHardDay": false
    }
  ],
  "totalVolumeKm": 35.0,
  "hardDayCount": 2,
  "rationale": "Intern begrunnelse (ikke vist til bruker direkte — weekFocus brukes i stedet)"
}

VIKTIG om structure-feltet:
- Alltid minimum 2 faser (oppvarming + hoveddel)
- For intervalløkter: spesifiser antall drag, lengde og pause tydelig i phase-feltet. Eks: "5 × 4 min hardt" med note: "3 min rolig mellom hvert drag"
- For terskeløkter: spesifiser draglengde og antall. Eks: "2 × 15 min terskelfart"
- For rolige turer og langturer: 3 faser (oppvarming, hoveddel, nedkjøling) er nok
- For hviledager: structure = [] (tom liste)
- pace og hrZone i structure skal matche paceZone og hrZone på økt-nivå

Generer nøyaktig 14 dager fra ${weekStartDate}. Fordel ${profile.trainingDaysPerWeek} treningsdager per uke jevnt.`;
}

export function buildDailyAdjustmentPrompt(context: {
  profile: RunwiseUserProfile;
  plannedWorkout: WeeklyPlanDay;
  mood: "tired" | "normal" | "strong";
  recentSummary: string;
  acwr: ACWRMetrics | null;
  vdot: number;
  weatherInfo?: string;
  missedTraining?: MissedTrainingAnalysis;
  weeklyVolumeKm?: number;
  weeksToRace?: number | null;
}): string {
  const { profile, plannedWorkout, mood, recentSummary, acwr, vdot, weatherInfo, missedTraining } = context;

  const moodMap = {
    tired: "Sliten / trøtt",
    normal: "Normal / OK",
    strong: "Sterk / energisk",
  };

  // ACWR hard grense i daglig justering
  const acwrAlert = acwr && acwr.ratio > 1.50
    ? `\n⚠️ ACWR FARESONE (${acwr.ratio.toFixed(2)}): Tving ned til rolig økt uansett humør. Helse før prestasjon.`
    : acwr && acwr.ratio > 1.30
    ? `\n⚠️ ACWR VARSELSONE (${acwr.ratio.toFixed(2)}): Vær veldig forsiktig med økt intensitet.`
    : "";

  const missedInfo = missedTraining && missedTraining.level !== "none" && missedTraining.easyOnlyDays > 0
    ? `\nTAPT TRENING: ${missedTraining.consecutiveRestDays} dager uten løping. Kun rolige E-sone-løp anbefalt.`
    : "";

  const raceDistanceKeyDaily = ((): RaceDistance => {
    const d = (profile.nextRaceDistance ?? "").toLowerCase();
    if (d.includes("5k") || d.includes("5 km")) return "5k";
    if (d.includes("10k") || d.includes("10 km")) return "10k";
    if (d.includes("halv") || d.includes("half") || d.includes("21")) return "half";
    if (d.includes("maraton") || d.includes("marathon") || d.includes("42")) return "marathon";
    return "general";
  })();
  const dailyCoachCtx = buildCoachingContext({
    raceDistance: raceDistanceKeyDaily,
    weeksToRace: context.weeksToRace ?? null,
    weeklyVolumeKm: context.weeklyVolumeKm ?? 0,
    trainingDaysPerWeek: profile.trainingDaysPerWeek || 4,
    vdot,
  });

  return `Du er en erfaren, varm og personlig løpetrener. Brukeren har sagt hvordan de føler seg i dag.

TONE: Varm og direkte. Aldri fagord som "belastning", "ACWR" eller "VO2max". Snakk til løperen, ikke om dem.

${dailyCoachCtx}

PLANLAGT ØKT I DAG:
- Type: ${plannedWorkout.workoutTypeNorwegian}
- Varighet: ${plannedWorkout.durationMinutes} min / ${plannedWorkout.estimatedDistanceKm} km
- Intensitet: ${plannedWorkout.intensityZone}
- Pace: ${plannedWorkout.paceZone || "Ikke spesifisert"}
- HR: ${plannedWorkout.hrZone || "Ikke spesifisert"}

BRUKERENS HUMØR: ${moodMap[mood]}

SISTE DAGERS TRENING:
${recentSummary}

${acwr ? `Treningsbelastning akkurat nå: ${acwr.ratio.toFixed(2)} (${acwr.status})${acwrAlert}` : ""}
${weatherInfo ? `VÆR: ${weatherInfo}` : ""}
${missedInfo}

JUSTERING:
- Sliten → Let på intensitet eller varighet. Hard økt → rolig løp. explanation: "Vi har lettet på dagens økt. Litt er alltid bedre enn ingenting."
- Normal → Behold planen. explanation: Si noe personlig og konkret om dagens økt.
- Sterk → Øk forsiktig. explanation: "Bra — men hold igjen. Formen din er best om noen dager."
- Treningsbelastning > 1.50 → Tving alltid til rolig, uansett humør.
- explanation: 1-2 setninger, norsk, varm tone. ALDRI fagord.

Svar med KUN gyldig JSON:
{
  "adjusted": {
    "dayOfWeek": ${plannedWorkout.dayOfWeek},
    "date": "${plannedWorkout.date}",
    "workoutType": "easy|threshold|interval|long|rest|recovery",
    "workoutTypeNorwegian": "Rolig tur|Terskeløkt|Intervalløkt|Langtur|Hviledag|Restitusjon",
    "durationMinutes": 45,
    "estimatedDistanceKm": 8.0,
    "intensityZone": "Z1-Z2",
    "hrZone": "130-150 bpm",
    "paceZone": "5:30-6:00/km",
    "description": "Personlig beskrivelse av den justerte økten, varm tone.",
    "isHardDay": false
  },
  "explanation": "Forklaring til løperen — 1-2 setninger, varm og direkte.",
  "changed": true
}`;
}

export function buildPostWorkoutFeedbackPrompt(context: {
  plannedWorkout: WeeklyPlanDay;
  actualPace: string;
  actualDistance: string;
  actualDuration: string;
  actualAvgHR?: number;
  activityName: string;
}): string {
  const { plannedWorkout, actualPace, actualDistance, actualDuration, actualAvgHR, activityName } = context;

  return `Du er en erfaren, varm løpetrener. Gi én personlig kommentar til denne treningsøkten.

TONE: Direkte og ekte. Ikke overdrevent positiv. Ikke fagord. Snakk til løperen.

PLANLAGT: ${plannedWorkout.workoutTypeNorwegian} — ${plannedWorkout.durationMinutes} min / ${plannedWorkout.estimatedDistanceKm} km @ ${plannedWorkout.paceZone || "fri pace"}
GJENNOMFØRT: "${activityName}" — ${actualDistance} / ${actualDuration} @ ${actualPace}${actualAvgHR ? ` / HR: ${actualAvgHR} bpm` : ""}

GOD TONE — eksempler:
- "Solid terskeløkt i dag — du holdt deg pent i sonen hele veien."
- "Du løp litt hardere enn planlagt, men kroppen din håndterte det bra."
- "Fin rolig tur — akkurat det kroppen din trengte etter gårsdagens innsats."
- "Jevn innsats fra start til slutt — sånn bygger du formen."

Svar med KUN én setning på norsk. Ingen JSON, ingen formattering.`;
}

// ─── Last Workout Review prompt ───────────────────────────────────────────────
export function buildLastWorkoutReviewPrompt(context: {
  activity: {
    name: string;
    type: string;
    distanceKm: number;
    durationMin: number;
    avgPace: string;
    avgHR?: number;
    maxHR?: number;
    date: string;
  };
  plannedWorkout?: {
    workoutTypeNorwegian: string;
    estimatedDistanceKm: number;
    paceZone?: string;
    intensityZone?: string;
  } | null;
  profile: {
    maxHR: number;
    vdot?: number;
    nextRaceDate?: string | null;
    nextRaceDistance?: string | null;
  };
}): string {
  const { activity, plannedWorkout, profile } = context;

  const raceInfo = profile.nextRaceDate && profile.nextRaceDistance
    ? `Neste løp: ${profile.nextRaceDistance} den ${profile.nextRaceDate}`
    : "Ingen planlagt løp";

  const plannedInfo = plannedWorkout
    ? `Planlagt: ${plannedWorkout.workoutTypeNorwegian} — ${plannedWorkout.estimatedDistanceKm} km @ ${plannedWorkout.paceZone || plannedWorkout.intensityZone || "fri pace"}`
    : "Ingen planlagt økt funnet for denne dagen";

  return `Du er en erfaren løpetrener som vurderer en gjennomført økt. Svar ALLTID på norsk.

REGLER FOR VURDERING:
- Vurderingen skal leses på under 10 sekunder
- headline: én kort setning — direkte og konkret
- body: én eller maks to setninger — hva skjedde og hva betyr det
- key_observation: én teknisk observasjon på vanlig norsk (UTEN fagsjargong)
- next_implication: koble til neste økt eller neste løp
- Aldri bruk: "flott", "bra jobba", "imponerende", "godt gjort"
- Aldri bruk fagsjargong: ikke "decoupling", "VDOT", "superkompensasjon", "aerob terskel"
- Vær ærlig: hvis noe ikke gikk bra, si det direkte men konstruktivt
- Ikke sammenlikn med andre løpere — bare med brukerens egne data
- Hvis økt ble hoppet over: ikke anklag, bare konstater og se fremover

RATING-REGLER:
- "excellent": utførte mer enn planlagt og med god kontroll
- "good": gjennomførte innenfor plan
- "ok": litt unna plan, men akseptabelt
- "hard": tøff dag, tydelig sliten eller langt unna plan
- "missed": ingen løpeøkt registrert (kun bruk dette hvis activity-type ikke er løping)

SISTE AKTIVITET:
Økt: ${activity.name} (${activity.type})
Dato: ${activity.date}
Distanse: ${activity.distanceKm.toFixed(1)} km
Varighet: ${activity.durationMin} min
Pace: ${activity.avgPace} /km
${activity.avgHR ? `Gjennomsnittspuls: ${activity.avgHR} bpm` : ""}
${activity.maxHR ? `Makspuls: ${activity.maxHR} bpm (profil: ${profile.maxHR} bpm)` : ""}

${plannedInfo}

BRUKERPROFIL:
${profile.vdot ? `VDOT: ${profile.vdot}` : ""}
Makspuls: ${profile.maxHR} bpm
${raceInfo}

Svar med BARE dette JSON-objektet (ingen tekst rundt):
{
  "rating": "good",
  "headline": "Én konkret setning.",
  "body": "Én eller to setninger om hva som skjedde.",
  "key_observation": "Én observasjon uten fagsjargong.",
  "next_implication": "Hva betyr dette for neste økt eller løp?",
  "actual_vs_planned": {
    "distance_diff_km": 0.0,
    "pace_diff_sec": 0,
    "within_plan": true
  }
}`;
}
