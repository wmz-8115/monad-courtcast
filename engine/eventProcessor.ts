import { proposeMarkets } from "./marketEngine.js";
import { applyTennisEvent, createInitialMatchState } from "./stateEngine.js";
import type { CurrentMatchState, MarketProposal, PointPulseEvent } from "./types.js";

export type ProcessedEvent = {
  accepted: boolean;
  reason?: "DUPLICATE_EVENT" | "STALE_SEQUENCE";
  state: CurrentMatchState;
  proposals: MarketProposal[];
};

/** Keeps replayed or repeated feed messages from generating duplicate markets. */
export class MatchEventProcessor {
  #state: CurrentMatchState;
  #seenEventIds = new Set<string>();

  constructor(matchId: string) {
    this.#state = createInitialMatchState(matchId);
  }

  get state(): CurrentMatchState {
    return this.#state;
  }

  process(event: PointPulseEvent): ProcessedEvent {
    if (this.#seenEventIds.has(event.eventId)) {
      return { accepted: false, reason: "DUPLICATE_EVENT", state: this.#state, proposals: [] };
    }
    if (event.sequence <= this.#state.lastSequence) {
      return { accepted: false, reason: "STALE_SEQUENCE", state: this.#state, proposals: [] };
    }

    const previous = this.#state;
    const next = applyTennisEvent(previous, event);
    this.#seenEventIds.add(event.eventId);
    this.#state = next;
    return { accepted: true, state: next, proposals: proposeMarkets(previous, next, event) };
  }
}
