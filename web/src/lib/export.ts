// Snapshot builder for the "export" button. Independent from timer-store so
// it can pull in the orientation prefs and core analyzers without dragging
// either into the store's hot path.
//
// Versus the raw on-disk shape: per-move tMs is dropped (the cuber wants the
// sequence, not the millisecond stream), and per-phase stats are computed
// at export time using the same analyzers SolveList renders with. Scrambles
// stay in the canonical WCA frame; move sequences are in the cuber's
// preferred frame, with the orientation noted in the header so a consumer
// can re-translate if needed.

import {
  analyzeSolveCases,
  batchPhases,
  collapseDoubleTurns,
  type Penalty,
  remapAlg,
  type Session,
  type SessionId,
  type Solve,
  type SolveId,
  type StageSlug,
} from "@cubing/core";
import { orientationPref } from "./orientation-pref.svelte";

const STAGES: StageSlug[] = ["cross", "f2l", "oll", "pll"];

export interface ExportPhase {
  stage: StageSlug;
  durationMs: number;
  moveCount: number;
  moves: string;
  case?: { id: string; name: string };
}

export interface ExportSolve {
  id: SolveId;
  sessionId: SessionId;
  startedAt: number;
  durationMs: number;
  scramble: string;
  penalty: Penalty;
  moves?: string;
  moveCount?: number;
  phases?: ExportPhase[];
}

export interface ExportSnapshot {
  exportedAt: number;
  version: 2;
  orientation: { top: string; front: string };
  sessions: Session[];
  solves: ExportSolve[];
}

export function buildExportSnapshot(
  sessions: Session[],
  solves: Solve[],
): ExportSnapshot {
  return {
    exportedAt: Date.now(),
    version: 2,
    orientation: { top: orientationPref.top, front: orientationPref.front },
    sessions,
    solves: solves.map(serializeSolve),
  };
}

function serializeSolve(s: Solve): ExportSolve {
  const base: ExportSolve = {
    id: s.id,
    sessionId: s.sessionId,
    startedAt: s.startedAt,
    durationMs: s.durationMs,
    scramble: s.scramble,
    penalty: s.penalty,
  };
  if (!s.moveStream || s.moveStream.length === 0) return base;

  const userFrameMoves = s.moveStream.map((m) =>
    orientationPref.displayMove(m.move),
  );
  const collapsed = collapseDoubleTurns(userFrameMoves);
  base.moves = collapsed.join(" ");
  base.moveCount = collapsed.length;

  // Phase analysis must run in the user's frame — the cross/F2L/OLL
  // predicates rely on cuber-frame orientation to fire correctly.
  const remap = orientationPref.faceRemap();
  const remappedScramble = remapAlg(s.scramble, remap);
  const remappedStream = s.moveStream.map((m) => ({
    ...m,
    move: orientationPref.displayMove(m.move),
  }));
  const analysis = batchPhases(remappedScramble, remappedStream);
  if (analysis.phases.length === 0) return base;

  const cases = analyzeSolveCases(remappedScramble, remappedStream, analysis);

  base.phases = STAGES.flatMap((stage): ExportPhase[] => {
    const p = analysis.phases.find((ph) => ph.stage === stage);
    if (!p) return [];
    const slice = collapseDoubleTurns(
      remappedStream.slice(p.startIndex, p.endIndex).map((m) => m.move),
    );
    const phase: ExportPhase = {
      stage,
      durationMs: p.durationMs,
      moveCount: slice.length,
      moves: slice.join(" "),
    };
    const recognized =
      stage === "oll" ? cases.oll : stage === "pll" ? cases.pll : null;
    if (recognized) phase.case = { id: recognized.id, name: recognized.name };
    return [phase];
  });

  return base;
}
