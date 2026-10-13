export type DemoOutcome = "YES" | "NO";

export type PrewrittenMarket = {
  id: string;
  /** Publish this many seconds before the market becomes visible in the replay. */
  publicationLeadSeconds: number;
  videoStartSeconds: number;
  bettingWindowSeconds: number;
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
 * CourtCast's 25:30–27:37 Zheng Qinwen replay. Times are relative to the
 * trimmed replay and are executed by the private operator, not manufactured
 * by the browser. Outcomes are deliberately deterministic test outcomes and
 * can be replaced before a public presentation.
 */
export const prerecordedTennisMarkets: readonly PrewrittenMarket[] = [
  {
    id: "courtcast-next-point-01",
    publicationLeadSeconds: 0,
    videoStartSeconds: 18,
    bettingWindowSeconds: 20,
    resolveDelaySeconds: 4,
    question: "下一球郑钦文获胜？",
    expectedOutcome: "YES",
  },
  {
    id: "courtcast-second-serve-02",
    publicationLeadSeconds: 0,
    videoStartSeconds: 57,
    // The original brief said both "12 seconds" and "ends at 26:29". The
    // documented 12-second interpretation is retained: 26:27–26:39.
    bettingWindowSeconds: 12,
    resolveDelaySeconds: 4,
    question: "郑钦文下一次发球是否二发？",
    expectedOutcome: "NO",
  },
  {
    id: "courtcast-second-serve-in-03",
    publicationLeadSeconds: 0,
    videoStartSeconds: 60,
    bettingWindowSeconds: 25,
    resolveDelaySeconds: 4,
    question: "若出现二发，郑钦文二发是否成功？",
    expectedOutcome: "YES",
  },
  {
    id: "courtcast-game-winner-04",
    publicationLeadSeconds: 0,
    videoStartSeconds: 90,
    bettingWindowSeconds: 120,
    resolveDelaySeconds: 4,
    question: "本局郑钦文获胜？",
    expectedOutcome: "NO",
  },
  {
    id: "courtcast-next-point-05",
    publicationLeadSeconds: 0,
    videoStartSeconds: 90,
    bettingWindowSeconds: 19,
    resolveDelaySeconds: 4,
    question: "下一球郑钦文获胜？",
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
 * Creates a small, repeatable set of real test bets. The amounts deliberately
 * stay below a single 100 mUSDC faucet allocation across all five markets.
 */
export function buildAutoBetPlan(market: PrewrittenMarket): AutoBetInstruction[] {
  const plan: AutoBetInstruction[] = [];
  let seed = seedFrom(market.id);
  const safeWindow = Math.max(2, market.bettingWindowSeconds - 4);
  const betCount = market.bettingWindowSeconds <= 12 ? 2 : 3;

  for (let index = 1; index <= betCount; index += 1) {
    seed = nextRandom(seed);
    const amountMusdc = 3 + (seed % 5);
    seed = nextRandom(seed);
    const side: DemoOutcome = seed % 2 === 0 ? "YES" : "NO";
    seed = nextRandom(seed);
    const nominalOffset = Math.floor((safeWindow * index) / (betCount + 1));
    const jitter = seed % 2;
    plan.push({ offsetSeconds: Math.min(safeWindow, Math.max(2, nominalOffset + jitter)), side, amountMusdc });
  }

  return plan;
}
