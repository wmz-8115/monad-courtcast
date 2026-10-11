import type { CurrentMatchState, PointPulseEvent } from "./types.js";

export function createInitialMatchState(matchId: string): CurrentMatchState {
  return { matchId, state: "AWAITING_MATCH_START", lastSequence: -1 };
}

/**
 * A deliberately small, deterministic tennis state reducer. It has no RPC,
 * wallet, clock, or provider dependency, making recorded matches replayable.
 */
export function applyTennisEvent(
  current: CurrentMatchState,
  event: PointPulseEvent,
): CurrentMatchState {
  if (event.matchId !== current.matchId) {
    throw new Error(`事件属于 ${event.matchId}，但当前状态属于 ${current.matchId}。`);
  }

  const base = {
    matchId: current.matchId,
    server: event.server ?? current.server,
    score: event.score ?? current.score,
    lastEventId: event.eventId,
    lastSequence: event.sequence,
  };

  switch (event.eventType) {
    case "MATCH_STARTED":
      return { ...base, state: "BETWEEN_POINTS" };
    case "FIRST_SERVE_READY":
      requireState(current, "BETWEEN_POINTS", event);
      return { ...base, state: "FIRST_SERVE_READY" };
    case "FIRST_SERVE_FAULT":
      requireState(current, "FIRST_SERVE_READY", event);
      return { ...base, state: "SECOND_SERVE_READY" };
    case "SECOND_SERVE_IN":
      requireState(current, "SECOND_SERVE_READY", event);
      return { ...base, state: "POINT_IN_PROGRESS" };
    case "SECOND_SERVE_FAULT":
      requireState(current, "SECOND_SERVE_READY", event);
      return { ...base, state: "BETWEEN_POINTS" };
    case "POINT_WON":
      requireState(current, "POINT_IN_PROGRESS", event);
      return { ...base, state: "BETWEEN_POINTS" };
  }
}

function requireState(
  current: CurrentMatchState,
  expected: CurrentMatchState["state"],
  event: PointPulseEvent,
): void {
  if (current.state !== expected) {
    throw new Error(`事件 ${event.eventType} 只能在 ${expected} 状态处理；当前为 ${current.state}。`);
  }
}
