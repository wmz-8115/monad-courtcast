import { buildDemoRunPlan, type ScheduledDemoAction } from "./demoRunPlan.js";
import type { DemoOutcome, PrewrittenMarket } from "./prerecordedScenario.js";

export type OperatorChainAdapter = {
  createMarket(question: string, closeAt: number, resolveAt: number): Promise<bigint>;
  placeBet(marketId: bigint, side: DemoOutcome, amountMusdc: number): Promise<void>;
  freezeMarket(marketId: bigint): Promise<void>;
  resolveMarket(marketId: bigint, outcome: DemoOutcome): Promise<void>;
};

export type ExecutedDemoAction = {
  action: ScheduledDemoAction["type"];
  marketId: string;
  onchainMarketId?: bigint;
};

/**
 * Stateful local worker. Call tick() periodically from a process that owns the
 * operator signer. The worker itself has no key and is easily testable.
 */
export class DemoOperator {
  #plan: ScheduledDemoAction[];
  #sessionStartedAt?: number;
  #completed = new Set<number>();
  #onchainMarketIds = new Map<string, bigint>();

  constructor(markets: readonly PrewrittenMarket[]) {
    this.#plan = buildDemoRunPlan(markets);
  }

  start(sessionStartedAt: number): void {
    if (this.#sessionStartedAt !== undefined) throw new Error("演示已经启动。");
    this.#sessionStartedAt = sessionStartedAt;
  }

  get sessionStartedAt(): number | undefined {
    return this.#sessionStartedAt;
  }

  get onchainMarketIds(): ReadonlyMap<string, bigint> {
    return this.#onchainMarketIds;
  }

  async tick(now: number, adapter: OperatorChainAdapter): Promise<ExecutedDemoAction[]> {
    if (this.#sessionStartedAt === undefined) throw new Error("请先启动演示。");
    const elapsedSeconds = now - this.#sessionStartedAt;
    const executed: ExecutedDemoAction[] = [];

    for (let index = 0; index < this.#plan.length; index += 1) {
      const scheduled = this.#plan[index];
      if (scheduled.atOffsetSeconds > elapsedSeconds || this.#completed.has(index)) continue;

      const completed = await this.#execute(scheduled, adapter);
      if (completed !== undefined) {
        this.#completed.add(index);
        executed.push(completed);
      }
    }

    return executed;
  }

  async #execute(
    scheduled: ScheduledDemoAction,
    adapter: OperatorChainAdapter,
  ): Promise<ExecutedDemoAction | undefined> {
    const { market } = scheduled;
    const existingMarketId = this.#onchainMarketIds.get(market.id);

    if (scheduled.type === "CREATE") {
      const closeAt = this.#sessionStartedAt! + market.videoStartSeconds + market.bettingWindowSeconds;
      const resolveAt = closeAt + market.resolveDelaySeconds;
      const onchainMarketId = await adapter.createMarket(market.question, closeAt, resolveAt);
      this.#onchainMarketIds.set(market.id, onchainMarketId);
      return { action: "CREATE", marketId: market.id, onchainMarketId };
    }

    // CREATE may be retrying after a transient RPC failure. Do not lose later
    // actions; keep them pending until the corresponding ID exists.
    if (existingMarketId === undefined) return undefined;

    if (scheduled.type === "AUTO_BET") {
      await adapter.placeBet(existingMarketId, scheduled.bet.side, scheduled.bet.amountMusdc);
      return { action: "AUTO_BET", marketId: market.id, onchainMarketId: existingMarketId };
    }
    if (scheduled.type === "FREEZE") {
      await adapter.freezeMarket(existingMarketId);
      return { action: "FREEZE", marketId: market.id, onchainMarketId: existingMarketId };
    }

    await adapter.resolveMarket(existingMarketId, market.expectedOutcome);
    return { action: "RESOLVE", marketId: market.id, onchainMarketId: existingMarketId };
  }
}
