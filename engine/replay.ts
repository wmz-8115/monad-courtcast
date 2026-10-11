import { MatchEventProcessor, type ProcessedEvent } from "./eventProcessor.js";
import type { PointPulseEvent } from "./types.js";

export type ReplayStep = ProcessedEvent & {
  event: PointPulseEvent;
};

/** Replays a single match feed in order without performing any chain action. */
export function replayMatch(
  matchId: string,
  events: readonly PointPulseEvent[],
): ReplayStep[] {
  const processor = new MatchEventProcessor(matchId);

  return events.map((event) => ({
    event,
    ...processor.process(event),
  }));
}

export function formatReplayStep(step: ReplayStep): string {
  const headline = `#${step.event.sequence} ${step.event.eventType} -> ${step.state.state}`;

  if (!step.accepted) {
    return `${headline}（忽略：${step.reason}）`;
  }

  if (step.proposals.length === 0) {
    return headline;
  }

  const proposals = step.proposals
    .map(
      (proposal) =>
        `市场草案：${proposal.question} [${proposal.options.join("/")}]，推荐下注窗口 ${proposal.recommendedBetWindowSeconds} 秒`,
    )
    .join("\n  ");

  return `${headline}\n  ${proposals}`;
}
