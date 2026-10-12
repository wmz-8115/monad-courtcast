import { indexer } from "envio";

const YES = 1n;
const NO = 2n;
const UNRESOLVED = 0n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

const outcomeName = (outcome: bigint) => outcome === YES ? "YES" : outcome === NO ? "NO" : "UNRESOLVED";
const activityId = (hash: string) => hash.toLowerCase();

async function writeActivity(
  context: any,
  event: any,
  marketId: string,
  kind: string,
  actor: string | undefined,
  side?: string,
  amount?: bigint,
) {
  context.MarketActivity.set({
    id: activityId(event.transaction.hash),
    market_id: marketId,
    kind,
    actor: (actor ?? ZERO_ADDRESS).toLowerCase(),
    side,
    amount,
    transactionHash: event.transaction.hash,
    blockNumber: BigInt(event.block.number),
    timestamp: BigInt(event.block.timestamp),
  });
}

// Transaction hash is explicitly requested because it is not a default event field.
const eventFields = {
  block: ["timestamp"] as const,
  transaction: ["hash", "from"] as const,
};

indexer.onEvent({ contract: "PredictionMarket", event: "MarketCreated", fields: eventFields }, async ({ event, context }) => {
  const id = event.params.marketId.toString();
  context.Market.set({
    id,
    marketId: event.params.marketId,
    creator: event.params.creator.toLowerCase(),
    question: event.params.question,
    closeAt: event.params.closeAt,
    resolveAt: event.params.resolveAt,
    state: "OPEN",
    outcome: undefined,
    yesPool: 0n,
    noPool: 0n,
    createdBlock: BigInt(event.block.number),
    createdAt: BigInt(event.block.timestamp),
    updatedBlock: BigInt(event.block.number),
    updatedAt: BigInt(event.block.timestamp),
  });
  await writeActivity(context, event, id, "MARKET_CREATED", event.params.creator);
});

indexer.onEvent({ contract: "PredictionMarket", event: "BetPlaced", fields: eventFields }, async ({ event, context }) => {
  const id = event.params.marketId.toString();
  const market = await context.Market.get(id);
  if (market === undefined) return;
  const isYes = event.params.side === YES;
  context.Market.set({
    ...market,
    yesPool: market.yesPool + (isYes ? event.params.amount : 0n),
    noPool: market.noPool + (isYes ? 0n : event.params.amount),
    updatedBlock: BigInt(event.block.number),
    updatedAt: BigInt(event.block.timestamp),
  });
  await writeActivity(context, event, id, "BET_PLACED", event.params.bettor, outcomeName(event.params.side), event.params.amount);
});

indexer.onEvent({ contract: "PredictionMarket", event: "MarketFrozen", fields: eventFields }, async ({ event, context }) => {
  const id = event.params.marketId.toString();
  const market = await context.Market.get(id);
  if (market === undefined) return;
  context.Market.set({ ...market, state: "FROZEN", updatedBlock: BigInt(event.block.number), updatedAt: BigInt(event.block.timestamp) });
  await writeActivity(context, event, id, "MARKET_FROZEN", event.transaction.from);
});

indexer.onEvent({ contract: "PredictionMarket", event: "MarketResolved", fields: eventFields }, async ({ event, context }) => {
  const id = event.params.marketId.toString();
  const market = await context.Market.get(id);
  if (market === undefined) return;
  context.Market.set({ ...market, state: "RESOLVED", outcome: outcomeName(event.params.outcome), updatedBlock: BigInt(event.block.number), updatedAt: BigInt(event.block.timestamp) });
  await writeActivity(context, event, id, "MARKET_RESOLVED", event.transaction.from, outcomeName(event.params.outcome));
});

indexer.onEvent({ contract: "PredictionMarket", event: "MarketCancelled", fields: eventFields }, async ({ event, context }) => {
  const id = event.params.marketId.toString();
  const market = await context.Market.get(id);
  if (market === undefined) return;
  context.Market.set({ ...market, state: "CANCELLED", outcome: outcomeName(event.params.outcome), updatedBlock: BigInt(event.block.number), updatedAt: BigInt(event.block.timestamp) });
  await writeActivity(context, event, id, "MARKET_AUTO_CANCELLED", event.transaction.from, outcomeName(event.params.outcome));
});

indexer.onEvent({ contract: "PredictionMarket", event: "MarketVoided", fields: eventFields }, async ({ event, context }) => {
  const id = event.params.marketId.toString();
  const market = await context.Market.get(id);
  if (market === undefined) return;
  context.Market.set({ ...market, state: "CANCELLED", updatedBlock: BigInt(event.block.number), updatedAt: BigInt(event.block.timestamp) });
  await writeActivity(context, event, id, "MARKET_VOIDED", event.params.creator);
});

indexer.onEvent({ contract: "PredictionMarket", event: "Claimed", fields: eventFields }, async ({ event, context }) => {
  await writeActivity(context, event, event.params.marketId.toString(), "CLAIMED", event.params.claimant, undefined, event.params.amount);
});

void UNRESOLVED;
