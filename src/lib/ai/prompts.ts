import { RunwiseUserProfile, WeeklyPlanDay, WeeklyPlan } from "@/types/runwise";
import { ACWRMetrics, DanielsTrainingPaces, WeeklyVolume, ConsistencyMetrics } from "@/lib/metrics";

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
  } = context;

  const raceInfo = profile.nextRaceDate && profile.nextRaceDistance
    ? `Neste løp: ${profile.nextRaceDistance} den ${profile.nextRaceDate}`
    : "Ingen planlagt løp";

  const paceInfo = danielsPaces
    ? `Treningspaces (Daniels): E: ${danielsPaces.easy} | M: ${danielsPaces.marathon} | T: ${danielsPaces.threshold} | I: ${danielsPaces.interval} | R: ${danielsPaces.repetition}`
    : "Treningspaces ikke tilgjengelig";

  const acwrInfo = acwr
    ? `ACWR: ${acwr.ratio.toFixed(2)} (${acwr.status}) - Akutt: ${acwr.acuteLoad.toFixed(1)}km, Kronisk: ${acwr.chronicLoad.toFixed(1)}km/uke`
    : "ACWR: Ikke nok data";

  const volumeHistory = weeklyVolumes.length > 0
    ? weeklyVolumes.map(w => `${w.weekLabel}: ${w.km.toFixed(1)}km (${w.sessions} økter)`).join("\n")
    : "Ingen historikk";

  const lastWeekInfo = lastWeekPlan
    ? `Forrige uke: ${lastWeekPlan.totalVolumeKm.toFixed(1)}km total, ${lastWeekPlan.hardDayCount} harde dager`
    : "Ingen forrige ukeplan";

  return `Du er en erfaren norsk løpetrener. Generer en ukentlig treningsplan for denne utøveren.

UTØVERPROFIL:
- Mål: ${profile.goal || "Generell forbedring"}
- ${raceInfo}
- Treningsdager per uke: ${profile.trainingDaysPerWeek}
- Mølle: ${profile.treadmillPreference === "yes" ? "Ja" : profile.treadmillPreference === "sometimes" ? "Av og til" : "Nei"}
- Max HR: ${profile.maxHR || "Ukjent"} bpm
- Hvile-HR: ${profile.restingHR || "Ukjent"} bpm
- VDOT: ${vdot > 0 ? vdot.toFixed(1) : "Ikke beregnet"}
- ${paceInfo}
- Skadehistorikk: ${profile.injuryHistory || "Ingen kjent"}

TRENINGSDATA:
- ${acwrInfo}
- ${lastWeekInfo}
- Konsistens: ${consistencyMetrics.avgSessionsPerWeek} økter/uke snitt
- Volum siste uker:
${volumeHistory}

UKEDATOER:
${daysOfWeek.map((d, i) => `${["Mandag", "Tirsdag", "Onsdag", "Torsdag", "Fredag", "Lørdag", "Søndag"][i]}: ${d}`).join("\n")}

REGLER:
1. Bruk ${profile.trainingDaysPerWeek} treningsdager, resten er hviledager
2. Følg 80/20-regelen: ~80% rolig/lett, ~20% hard intensitet
3. Aldri to harde dager etter hverandre
4. Maks 10% økning i ukevolum vs forrige uke
5. Langtur helst på lørdag eller søndag
6. Tilpass treningspaces til utøverens VDOT/Daniels-paces
7. Alle beskrivelser skal være på norsk, vanlig språk, maks 2 setninger
8. ${profile.treadmillPreference === "sometimes" ? "Legg til tredemølle-variant for hver økt" : "Ingen tredemølle-variant nødvendig"}

Svar med KUN gyldig JSON i følgende format (ingen annen tekst):
{
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
      "description": "Kort begrunnelse på norsk, maks 2 setninger.",
      "treadmillVariant": "Alternativ beskrivelse for tredemølle (hvis aktuelt)",
      "isHardDay": false
    }
  ],
  "totalVolumeKm": 35.0,
  "hardDayCount": 2,
  "rationale": "Kort begrunnelse for uken på norsk."
}

Generer nøyaktig 7 dager (mandag til søndag) for uken som starter ${weekStartDate}.`;
}

export function buildDailyAdjustmentPrompt(context: {
  profile: RunwiseUserProfile;
  plannedWorkout: WeeklyPlanDay;
  mood: "tired" | "normal" | "strong";
  recentSummary: string;
  acwr: ACWRMetrics | null;
  vdot: number;
  weatherInfo?: string;
}): string {
  const { profile, plannedWorkout, mood, recentSummary, acwr, vdot, weatherInfo } = context;

  const moodMap = {
    tired: "Sliten / trøtt",
    normal: "Normal / OK",
    strong: "Sterk / energisk",
  };

  return `Du er en norsk løpetrener. Brukeren har rapportert hvordan de føler seg i dag. Juster dagens planlagte økt basert på dette.

PLANLAGT ØKT I DAG:
- Type: ${plannedWorkout.workoutTypeNorwegian} (${plannedWorkout.workoutType})
- Varighet: ${plannedWorkout.durationMinutes} min
- Distanse: ${plannedWorkout.estimatedDistanceKm} km
- Intensitet: ${plannedWorkout.intensityZone}
- Pace: ${plannedWorkout.paceZone || "Ikke spesifisert"}
- HR: ${plannedWorkout.hrZone || "Ikke spesifisert"}

BRUKERENS HUMØR: ${moodMap[mood]}

SISTE DAGERS TRENING:
${recentSummary}

${acwr ? `ACWR: ${acwr.ratio.toFixed(2)} (${acwr.status})` : ""}
VDOT: ${vdot > 0 ? vdot.toFixed(1) : "Ukjent"}
${weatherInfo ? `VÆR: ${weatherInfo}` : ""}

REGLER:
- Hvis "sliten": Reduser intensitet og/eller varighet. Endre hard økt til lett/rolig.
- Hvis "normal": Behold planen som den er, eller gjør minimale justeringer.
- Hvis "sterk": Kan øke litt, men vær konservativ. Ikke gjør hviledag til hard økt.
- Forklar endringen i 1-2 setninger på norsk, vanlig språk.
- Hvis ingen endring trengs, returner den opprinnelige økten med en forklaring.

Svar med KUN gyldig JSON (ingen annen tekst):
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
    "description": "Beskrivelse av økten.",
    "isHardDay": false
  },
  "explanation": "Forklaring av endringen på norsk.",
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

  return `Du er en norsk løpetrener. Gi en kort, personlig vurdering av denne økten.

PLANLAGT:
- Type: ${plannedWorkout.workoutTypeNorwegian}
- Varighet: ${plannedWorkout.durationMinutes} min
- Distanse: ${plannedWorkout.estimatedDistanceKm} km
- Pace: ${plannedWorkout.paceZone || "Ikke spesifisert"}
- HR: ${plannedWorkout.hrZone || "Ikke spesifisert"}

GJENNOMFØRT:
- Navn: "${activityName}"
- Distanse: ${actualDistance}
- Varighet: ${actualDuration}
- Pace: ${actualPace}
${actualAvgHR ? `- Snitt HR: ${actualAvgHR} bpm` : ""}

Skriv EN setning på norsk som er personlig og oppmuntrende. Eksempler:
- "Solid terskeløkt i dag — du holdt deg pent i sonen hele veien."
- "Du løp litt hardere enn planlagt, men kroppen din håndterte det bra."
- "Fin rolig tur — akkurat det kroppen din trengte etter gårsdagens innsats."

Svar med KUN én setning, ingen JSON, ingen formattering.`;
}
