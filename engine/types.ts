/** Source-neutral events emitted by a sports-data adapter or the local simulator. */
export type TennisEventType =
  | "MATCH_STARTED"
  | "FIRST_SERVE_READY"
  | "FIRST_SERVE_FAULT"
  | "SECOND_SERVE_IN"
  | "SECOND_SERVE_FAULT"
  | "POINT_WON";

export type MatchStateName =
  | "AWAITING_MATCH_START"
  | "BETWEEN_POINTS"
  | "FIRST_SERVE_READY"
  | "SECOND_SERVE_READY"
  | "POINT_IN_PROGRESS";

export type PointPulseEvent = {
  eventId: string;
  matchId: string;
  eventType: TennisEventType;
  server?: string;
  score?: string;
  timestamp: number;
  sequence: number;
  schemaVersion: "1.0";
};

export type CurrentMatchState = {
  matchId: string;
  state: MatchStateName;
  server?: string;
  score?: string;
  lastEventId?: string;
  lastSequence: number;
};

export type MarketProposal = {
  proposalId: string;
  template: "DOUBLE_FAULT";
  matchId: string;
  /** The player whose next second serve is being evaluated. */
  subject: string;
  question: string;
  options: readonly ["YES", "NO"];
  triggerEventId: string;
  triggerSequence: number;
  /** Unix seconds of the source event that triggered this proposal. */
  triggerTimestamp: number;
  recommendedBetWindowSeconds: number;
  status: "DRAFT";
};

/** Conservative estimates, in seconds, used before a draft may reach trading. */
export type SafeWindowPolicy = {
  estimatedDataDelaySeconds: number;
  estimatedChainConfirmationSeconds: number;
  safetyBufferSeconds: number;
  minimumTradableWindowSeconds: number;
};

export type SafeWindowDecision = {
  proposalId: string;
  status: "APPROVED" | "REJECTED";
  reason?: "OUTCOME_ALREADY_DUE" | "WINDOW_TOO_SHORT";
  chainReadyAt: number;
  latestFreezeAt: number;
  effectiveBetWindowSeconds: number;
};

/** A local instruction that can later be translated into createMarket arguments. */
export type CreateMarketIntent = {
  intentId: string;
  proposalId: string;
  question: string;
  closeAt: number;
  resolveAt: number;
  status: "QUEUED";
};

export type OrchestrationResult = {
  accepted: boolean;
  reason?: "SAFE_WINDOW_REJECTED";
  intent?: CreateMarketIntent;
};

/** Local result evidence, ready for a future Oracle/resolve adapter. */
export type SettlementDraft = {
  settlementId: string;
  proposalId: string;
  matchId: string;
  outcome: "YES" | "NO";
  sourceEventId: string;
  sourceSequence: number;
  status: "PENDING_ORACLE";
};

export type SettlementPlanningResult = {
  planned: boolean;
  reason?: "IRRELEVANT_EVENT" | "ALREADY_PLANNED";
  draft?: SettlementDraft;
};
