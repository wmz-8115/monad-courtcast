import type { PointPulseEvent } from "./types.js";

/**
 * A deterministic local feed used to demonstrate the full serve lifecycle.
 * It deliberately includes a first-serve fault followed by a second-serve
 * fault, so the generated DOUBLE_FAULT market can later be resolved YES.
 */
export const doubleFaultScenario: readonly PointPulseEvent[] = [
  {
    eventId: "sim-sinner-alcaraz-001",
    matchId: "sim-sinner-vs-alcaraz",
    eventType: "MATCH_STARTED",
    timestamp: 1_791_051_200,
    sequence: 1,
    schemaVersion: "1.0",
  },
  {
    eventId: "sim-sinner-alcaraz-002",
    matchId: "sim-sinner-vs-alcaraz",
    eventType: "FIRST_SERVE_READY",
    server: "SINNER",
    score: "30-15",
    timestamp: 1_791_051_205,
    sequence: 2,
    schemaVersion: "1.0",
  },
  {
    eventId: "sim-sinner-alcaraz-003",
    matchId: "sim-sinner-vs-alcaraz",
    eventType: "FIRST_SERVE_FAULT",
    server: "SINNER",
    score: "30-15",
    timestamp: 1_791_051_207,
    sequence: 3,
    schemaVersion: "1.0",
  },
  {
    eventId: "sim-sinner-alcaraz-004",
    matchId: "sim-sinner-vs-alcaraz",
    eventType: "SECOND_SERVE_FAULT",
    server: "SINNER",
    score: "30-30",
    timestamp: 1_791_051_210,
    sequence: 4,
    schemaVersion: "1.0",
  },
];
