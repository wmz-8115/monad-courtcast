export type DemoOutcome = "YES" | "NO";

export type PrewrittenMarket = {
  id: string;
  /** Publish this many seconds before the market becomes visible in the replay. */
  publicationLeadSeconds: number;
  videoStartSeconds: number;
  bettingWindowSeconds: 30 | 45 | 60;
  resolveDelaySeconds: number;
  question: string;
  expectedOutcome: DemoOutcome;
};

export type AutoBetInstruction = {
  offsetSeconds: number;
  side: DemoOutcome;
  amountMusdc: number;
};

/**
 * Video-independent placeholder timeline. Once the user supplies licensed
 * footage, only the questions, offsets, and outcomes need retiming.
 */
export const prerecordedTennisMarkets: readonly PrewrittenMarket[] = [
  {
    id: "serve-ace-01",
    publicationLeadSeconds: 8,
    videoStartSeconds: 15,
    bettingWindowSeconds: 30,
    resolveDelaySeconds: 5,
    question: "Will this serve be an ace?",
    expectedOutcome: "NO",
  },
  {
    id: "second-serve-fault-02",
    publicationLeadSeconds: 8,
    videoStartSeconds: 40,
    bettingWindowSeconds: 45,
    resolveDelaySeconds: 5,
    question: "Will the second serve be a fault?",
    expectedOutcome: "YES",
  },
  {
    id: "rally-length-03",
    publicationLeadSeconds: 8,
    videoStartSeconds: 70,
    bettingWindowSeconds: 60,
    resolveDelaySeconds: 5,
    question: "Will this rally last at least four shots?",
    expectedOutcome: "YES",
  },
  {
    id: "receiver-point-04",
    publicationLeadSeconds: 8,
    videoStartSeconds: 110,
    bettingWindowSeconds: 30,
    resolveDelaySeconds: 5,
    question: "Will the receiver win this point?",
    expectedOutcome: "NO",
  },
  {
    id: "serve-in-05",
    publicationLeadSeconds: 8,
    videoStartSeconds: 135,
    bettingWindowSeconds: 45,
    resolveDelaySeconds: 5,
    question: "Will this serve land in?",
    expectedOutcome: "YES",
  },
];

function seedFrom(value: string): number {
  let seed = 2_166_136_261;
  for (const character of value) {
    seed ^= character.charCodeAt(0);
    seed = Math.imul(seed, 16_777_619);
  }
  return seed >>> 0;
}

function nextRandom(seed: number): number {
  return (Math.imul(seed, 1_664_525) + 1_013_904_223) >>> 0;
}

/**
 * Creates repeatable operator orders about every three seconds. Reproducible
 * pseudo-randomness makes a presentation stable while still looking active.
 */
export function buildAutoBetPlan(market: PrewrittenMarket): AutoBetInstruction[] {
  const plan: AutoBetInstruction[] = [];
  let seed = seedFrom(market.id);
  let offsetSeconds = 2;

  while (offsetSeconds < market.bettingWindowSeconds) {
    seed = nextRandom(seed);
    const amountMusdc = 20 + (seed % 31);
    seed = nextRandom(seed);
    const side: DemoOutcome = seed % 2 === 0 ? "YES" : "NO";
    plan.push({ offsetSeconds, side, amountMusdc });

    seed = nextRandom(seed);
    offsetSeconds += 2 + (seed % 3);
  }

  return plan;
}
