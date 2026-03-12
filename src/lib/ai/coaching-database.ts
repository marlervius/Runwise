/**
 * Runwise Coaching Philosophy Database v1.0
 *
 * Destillerte prinsipper fra verdens beste løpecoacher — brukt av Runwise AI
 * til å generere faglig forankrede treningsprogram for 5 km, 10 km, halvmaraton og maraton.
 *
 * Kilde: Runwise_CoachingDatabase.docx
 */

export type RaceDistance = "5k" | "10k" | "half" | "marathon" | "general";
export type TrainingPhase = "fundamental" | "special" | "specific" | "maintenance";
export type PrimaryCoach = "daniels" | "pfitzinger" | "canova" | "bakken" | "lydiard";

// ─── Coach philosophies ────────────────────────────────────────────────────────

export const COACHING_PHILOSOPHIES = {
  daniels: {
    name: "Jack Daniels",
    summary:
      "Vitenskapsbasert system bygget på VDOT — alle paces utledes fra faktisk løpsprestasjon. " +
      "Fem klart definerte økttyper med hvert sitt fysiologiske formål.",
    keyPrinciples: [
      "Beregn alltid VDOT fra siste Strava-prestasjon — ikke fra målpace",
      "Terskelarbeid (T) er den viktigste enkeltøkten for halvmaraton og 10 km",
      "Easy-løping skal aldri kompromisses — minimum 80% av ukvolum",
      "Øk VDOT-estimat gradvis, maks én gang per 4–6 uker",
      "For mosjonister: ikke introduser I-intervaller før T-arbeid sitter (minimum 4 uker T-trening)",
    ],
    workoutTypes: {
      E: "Easy — aerob base, Z1–Z2, samtaletempo",
      M: "Marathon pace — maraton-spesifikk fart, Z3",
      T: "Threshold — ubehagelig men kontrollerbar, ca. 4 mmol laktat, Z3–Z4",
      I: "Interval — VO2max-stimulering, 3–5 min drag, Z5",
      R: "Repetition — fart og løpsøkonomi, korte drag med full pause",
    },
    bestFor: ["10k", "half"] as RaceDistance[],
    scalesWellToAmateur: true,
  },

  pfitzinger: {
    name: "Pete Pfitzinger",
    summary:
      "Volum som fundament. Viktigste bidrag: den mellomstore midtukes-langturen (MLR, 18–22 km). " +
      "Primært for halvmaraton og maraton.",
    keyPrinciples: [
      "Medium long run (MLR) skal introduseres for alle med mål om halvmaraton eller maraton",
      "MLR plasseres tirsdag eller onsdag — aldri dagen etter langtur",
      "LT-tempo for mosjonister: ca. 15 km-tempo (litt raskere enn halvmaratontempo)",
      "Ikke anbefal Pfitzinger-volum til løpere under 40 km/uke — skaderisiko",
      "Pfitzinger er mest relevant ved >12 uker til løp og >45 km/uke",
    ],
    workoutTypes: {
      MLR: "Medium long run — 18–22 km midtukes, aerob volum",
      LT: "Laktatterskeldrag — 20–40 min kontinuerlig terskelarbeid",
      LongRun: "Langtur — 27–38 km for maraton, lavere intensitet",
    },
    bestFor: ["half", "marathon"] as RaceDistance[],
    scalesWellToAmateur: false, // primært for eliteorienterte med høyt volum
  },

  canova: {
    name: "Renato Canova",
    summary:
      "Trakt-periodisering: all trening nærmer seg gradvis løpstempo og løpsdistanse. " +
      "Tidlig i syklusen er treningen bred og generell; snevres inn mot svært løpsspesifikk trening siste 6–8 uker.",
    keyPrinciples: [
      ">12 uker til løp (fundamental fase): bredt fartsspekter, bygg base",
      "6–12 uker til løp (special fase): arbeid mot løpstempo fra begge sider",
      "<6 uker til løp (spesifikk fase): mye tid nær løpstempo",
      "Ingenting forlates: vedlikehold tidligere arbeid med ett innslag per 2–3 uker",
      "Traktmodellen: jo nærmere løpet, jo smalere fartsspekter",
    ],
    workoutTypes: {
      Fundamental: "Bred base — variert fart, høyt volum, lav til moderat intensitet",
      Special: "Løpsnær intensitet fra begge sider — litt raskere og litt saktere enn løpstempo",
      Specific: "Svært spesifikk — mye tid nær konkurransetempo",
    },
    bestFor: ["half", "marathon"] as RaceDistance[],
    scalesWellToAmateur: true, // strukturen skalerer godt, men volum må justeres
  },

  bakken: {
    name: "Marius Bakken",
    summary:
      "Den norske modellen — dobbel terskeltrening. To terskeløkter samme dag fremfor én hard økt. " +
      "Muliggjør mer terskelarbeid per uke uten å akkumulere for mye muskelstress.",
    keyPrinciples: [
      "Dobbel terskel er ikke relevant for mosjonister som løper <5 dager/uke — bruk enkel terskeløkt",
      "For brukere med >5 dager/uke: introduser dobbel terskel som alternativ",
      "Terskelintensitet: ubehagelig men kontrollerbar, ca. 4 mmol laktat (Z3–Z4)",
      "80–85% av uksvolumet skal alltid være rolig — dette er ikke-forhandlingsbart",
      "Korte terskelintervaller (6–10 min) foretrekkes fremfor lange kontinuerlige terskeløkter",
    ],
    workoutTypes: {
      SingleThreshold: "Enkel terskel — én terskeløkt per dag, standard for mosjonister",
      DoubleThreshold: "Dobbel terskel — to kortere terskeløkter samme dag (morgen + kveld)",
    },
    bestFor: ["10k", "half"] as RaceDistance[],
    scalesWellToAmateur: true,
  },

  lydiard: {
    name: "Arthur Lydiard",
    summary:
      "Opphavet til moderne utholdenhetstrening. Aerob base er fundamentet for all løpsprestasjon — " +
      "uavhengig av distanse. Selv 800m-løpere trente 160 km/uke på lett intensitet i basefasen.",
    keyPrinciples: [
      "Lydiards baseperiode-filosofi brukes når løper er >16 uker fra løp",
      "Aerob basis kompromisses aldri: rolig løping er alltid grunnmuren",
      "Bakkearbeid er undervurdert for mosjonister — introduser det i fundamentfasen",
      "Konkurranseperiode-logikk: reduser volum, øk spesifisitet — siste 6–8 uker",
      "Ingen hard trening før basen er solid på plass",
    ],
    workoutTypes: {
      BaseRun: "Aerob base — lett til moderat, høyt volum, Z1–Z2",
      HillSprings: "Bakkestyrke — korte bakkedrag for styrke og løpsøkonomi",
      SharpPeriod: "Skarpfase — fartstrening etter basen er bygget",
    },
    bestFor: ["general", "5k", "10k", "half", "marathon"] as RaceDistance[],
    scalesWellToAmateur: true,
  },
} as const;

// ─── Phase definitions (Canova funnel) ────────────────────────────────────────

export const TRAINING_PHASES: Record<TrainingPhase, {
  label: string;
  weeksToRace: string;
  focus: string;
  intensityProfile: string;
  coachWeight: Partial<Record<PrimaryCoach, number>>;
}> = {
  fundamental: {
    label: "Fundamental fase",
    weeksToRace: ">12 uker",
    focus: "Aerob base og generell utholdenhet. Bredt fartsspekter, høyt volum, lav intensitet.",
    intensityProfile: "85–90% rolig, 10–15% moderat terskel, ingen R-intervaller",
    coachWeight: { lydiard: 0.5, daniels: 0.3, canova: 0.2 },
  },
  special: {
    label: "Special fase",
    weeksToRace: "6–12 uker",
    focus: "Løpsnær trening fra begge sider. Terskelarbeid øker, volum vedlikeholdes.",
    intensityProfile: "80% rolig, 15% terskel/MP, 5% over løpstempo",
    coachWeight: { daniels: 0.4, canova: 0.3, bakken: 0.2, pfitzinger: 0.1 },
  },
  specific: {
    label: "Spesifikk fase",
    weeksToRace: "<6 uker",
    focus: "Svært løpsspesifikk trening. Mye tid nær konkurransetempo. Volum reduseres.",
    intensityProfile: "75% rolig, 20% nær løpstempo, 5% over løpstempo",
    coachWeight: { canova: 0.4, daniels: 0.3, bakken: 0.2, pfitzinger: 0.1 },
  },
  maintenance: {
    label: "Vedlikeholdsperiode",
    weeksToRace: "Ingen planlagt løp",
    focus: "Oppretthold form og glede. Ingen periodisert progresjon. Vær-basert fleksibilitet.",
    intensityProfile: "80% rolig, 15% terskel, 5% fart",
    coachWeight: { daniels: 0.4, lydiard: 0.3, bakken: 0.2, canova: 0.1 },
  },
};

// ─── Intensity distribution rules ─────────────────────────────────────────────

export const INTENSITY_RULES = {
  easyMinPct: 80, // minimum andel rolig løping alltid
  maxHardDaysPerWeek: {
    below50km: 2,   // maks 2 harde dager for <50 km/uke
    above50km: 3,   // maks 3 harde dager for >50 km/uke
  },
  iIntervalsRequirement: "Minimum 4 uker T-terskeltrening før I-intervaller introduseres",
  doubleThresholdMinDays: 5, // dobbel terskel kun ved >=5 treningsdager/uke
} as const;

// ─── Distance-specific key workouts ───────────────────────────────────────────

export const KEY_WORKOUTS_BY_DISTANCE: Record<RaceDistance, {
  primary: string;
  secondary: string;
  note: string;
}> = {
  "5k": {
    primary: "R-intervaller (Daniels) — fart og løpsøkonomi",
    secondary: "T-terskel 1×/uke",
    note: "Kort og intensivt. R-intervaller bygger den råfarten 5 km krever.",
  },
  "10k": {
    primary: "T-terskel 2×/uke (Daniels/Bakken)",
    secondary: "I-intervaller etter terskelgrunnlag er etablert",
    note: "Terskel er nøkkelen til 10 km. Dobbel terskel kan vurderes ved >5 dager/uke.",
  },
  "half": {
    primary: "T-terskel + langtur (Daniels/Bakken)",
    secondary: "Medium long run midtukes (Pfitzinger) ved >40 km/uke",
    note: "Halvmaraton belønner solid terskelgrunnlag og god aerob base.",
  },
  "marathon": {
    primary: "MLR midtuken + langtur med MP-drag (Pfitzinger/Canova)",
    secondary: "T-terskel for å heve laktatterskelen",
    note: "Maraton handler om volum, MLR og spesifisitet mot løpstempo siste 8 uker.",
  },
  "general": {
    primary: "T-terskel 1–2×/uke",
    secondary: "Langtur ukentlig",
    note: "Uten planlagt løp: bygg base og løp for glede. Lydiard-filosofi dominerer.",
  },
};

// ─── Scaling rules for amateur runners ────────────────────────────────────────

export const AMATEUR_SCALING = {
  volumeReductionPct: { min: 40, max: 60 }, // skaler ned elite-volum med 40–60%
  structurePreserved: true, // behold proporsjoner og struktur
  bestScalingCoaches: ["daniels", "bakken"] as PrimaryCoach[],
  limitedScalingCoaches: ["pfitzinger", "canova"] as PrimaryCoach[], // primært elitesystemer
  pfitzingerMinKmPerWeek: 40, // ikke bruk Pfitzinger under dette
  pfitzingerMinWeeksToRace: 12,
} as const;

// ─── Primary coach selector ────────────────────────────────────────────────────

export function selectPrimaryCoach(context: {
  raceDistance: RaceDistance;
  weeksToRace: number | null;
  weeklyVolumeKm: number;
  trainingDaysPerWeek: number;
  vdot: number;
}): {
  primary: PrimaryCoach;
  supporting: PrimaryCoach[];
  phase: TrainingPhase;
  rationale: string;
} {
  const { raceDistance, weeksToRace, weeklyVolumeKm, trainingDaysPerWeek } = context;

  // Bestem treningsfase
  let phase: TrainingPhase;
  if (weeksToRace === null || weeksToRace > 16) {
    phase = weeksToRace === null ? "maintenance" : "fundamental";
  } else if (weeksToRace > 12) {
    phase = "fundamental";
  } else if (weeksToRace > 6) {
    phase = "special";
  } else {
    phase = "specific";
  }

  // Velg primærcoach basert på distanse, fase og volum
  let primary: PrimaryCoach;
  let supporting: PrimaryCoach[];
  let rationale: string;

  if (phase === "fundamental" || phase === "maintenance") {
    // Lydiard-base er alltid fundamentet
    primary = "lydiard";
    supporting = ["daniels", "canova"];
    rationale = "Fundamental fase: Lydiard-basefil­osofi dominerer. Aerob base og volum er prioritet.";
  } else if (raceDistance === "5k") {
    primary = "daniels";
    supporting = ["bakken"];
    rationale = "5 km: Daniels R-intervaller + terskelarbeid. Korte, intensive drag.";
  } else if (raceDistance === "10k") {
    primary = trainingDaysPerWeek >= 5 ? "bakken" : "daniels";
    supporting = ["daniels", "canova"];
    rationale = trainingDaysPerWeek >= 5
      ? "10 km + ≥5 dager/uke: Bakken dobbel-terskel-modell er optimal."
      : "10 km: Daniels terskelarbeid 2×/uke. Enkelt og effektivt for mosjonister.";
  } else if (raceDistance === "half") {
    if (weeklyVolumeKm >= 45 && weeksToRace !== null && weeksToRace >= 12) {
      primary = "pfitzinger";
      supporting = ["daniels", "bakken"];
      rationale = "Halvmaraton + >45 km/uke + >12 uker: Pfitzinger MLR midtukes er svært effektivt.";
    } else {
      primary = "daniels";
      supporting = ["bakken", "canova"];
      rationale = "Halvmaraton: Daniels terskel + langtur. Bakken dobbel terskel ved >5 dager/uke.";
    }
  } else if (raceDistance === "marathon") {
    if (weeklyVolumeKm >= 40) {
      primary = "pfitzinger";
      supporting = ["canova", "daniels"];
      rationale = "Maraton + >40 km/uke: Pfitzinger MLR + Canova spesifisitet er kjernen.";
    } else {
      primary = "canova";
      supporting = ["daniels", "lydiard"];
      rationale = "Maraton (lavere volum): Canova-traktmodell skalert ned. Bygg base og spesifisitet gradvis.";
    }
  } else {
    primary = "daniels";
    supporting = ["lydiard"];
    rationale = "Generell trening: Daniels-struktur med Lydiard-basetankegang.";
  }

  return { primary, supporting, phase, rationale };
}

// ─── Build coaching context string for AI prompt ──────────────────────────────

export function buildCoachingContext(context: {
  raceDistance: RaceDistance;
  weeksToRace: number | null;
  weeklyVolumeKm: number;
  trainingDaysPerWeek: number;
  vdot: number;
}): string {
  const selection = selectPrimaryCoach(context);
  const primaryCoach = COACHING_PHILOSOPHIES[selection.primary];
  const phase = TRAINING_PHASES[selection.phase];
  const keyWorkouts = KEY_WORKOUTS_BY_DISTANCE[context.raceDistance];

  const supportingText = selection.supporting
    .map(c => COACHING_PHILOSOPHIES[c].name)
    .join(", ");

  const principlesText = primaryCoach.keyPrinciples
    .map(p => `  - ${p}`)
    .join("\n");

  const scalingNote = !primaryCoach.scalesWellToAmateur
    ? `\n  ⚠️ Skaler ned volum med 40–60% fra eliteprogrammer. Behold struktur og proporsjoner.`
    : "";

  return `COACHING-FILOSOFI OG METODIKK:
Primærcoach: ${primaryCoach.name}
Støttecoacher: ${supportingText}
Treningsfase: ${phase.label} (${phase.weeksToRace} til løp)

PRIMÆRCOACHENS KJERNEPRINSIPPER:
${principlesText}${scalingNote}

FASEFOKUS (${phase.label}):
${phase.focus}
Intensitetsprofil: ${phase.intensityProfile}

NØKKELTRENING FOR ${context.raceDistance.toUpperCase()}:
- Primær økt: ${keyWorkouts.primary}
- Sekundær økt: ${keyWorkouts.secondary}
- Coaching-notat: ${keyWorkouts.note}

INTENSITETSREGLER (ikke-forhandlingsbare):
- Minimum ${INTENSITY_RULES.easyMinPct}% av uksvolumet skal være rolig løping
- Maks ${context.weeklyVolumeKm < 50 ? INTENSITY_RULES.maxHardDaysPerWeek.below50km : INTENSITY_RULES.maxHardDaysPerWeek.above50km} harde dager per uke (${context.weeklyVolumeKm < 50 ? "<50" : "≥50"} km/uke)
- ${INTENSITY_RULES.iIntervalsRequirement}

COACHVALG-BEGRUNNELSE:
${selection.rationale}`;
}
