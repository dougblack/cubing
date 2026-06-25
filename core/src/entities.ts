// Domain entities for the cubing app. Persistence is delegated to platform-
// specific repositories (see ./repositories.ts) — on web, IndexedDB or
// SQLite-WASM; on iOS, CoreData / SwiftData. The entity *shapes* are the
// shared contract; the storage is not.
//
// All timestamps are UTC milliseconds since epoch.
// All identifiers are opaque strings (typically UUIDv7 for sortability).

import type { StageSlug } from "./types.js";

// ---------- Identifier types (branded for safety) ----------
// Branding prevents accidentally passing a SolveId where a SessionId is wanted.

declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { readonly [__brand]: B };

export type SolveId = Brand<string, "SolveId">;
export type SessionId = Brand<string, "SessionId">;
export type TrainerAttemptId = Brand<string, "TrainerAttemptId">;
export type CaseId = string; // Matches data/methods/<method>/<stage>.json case ids.

// ---------- Solve ----------

/** Standard WCA solve penalty. */
export type Penalty = "none" | "+2" | "DNF";

/** A single move event from a Bluetooth cube. `tMs` is the time since the
 *  solve's `startedAt`. */
export interface MoveEvent {
  /** Single WCA notation move, e.g. "R", "U2", "L'". */
  move: string;
  tMs: number;
}

export interface Solve {
  id: SolveId;
  sessionId: SessionId;
  /** UTC ms of solve start (after inspection). */
  startedAt: number;
  /** Stop time minus start time, including penalties applied below. */
  durationMs: number;
  scramble: string;
  penalty: Penalty;
  /** Optional move stream — populated only when a BT cube was used. */
  moveStream?: MoveEvent[];
}

// ---------- Session ----------

export interface Session {
  id: SessionId;
  name: string;
  createdAt: number;
}

// ---------- Algorithm preferences ----------

/** User's preferred algorithm for a given case. The algorithm is identified
 *  by its index into the stage JSON's `cases[i].algorithms` array — that
 *  index is stable across reads of the canonical dataset. */
export interface AlgPreference {
  caseId: CaseId;
  preferredAlgIndex: number;
}

// ---------- Trainer ----------

export interface TrainerAttempt {
  id: TrainerAttemptId;
  /** Trainer session this attempt belongs to. Same `Session` shape as
   *  the timer uses — sessions are bucket-only, they don't constrain
   *  which cases get drilled. */
  sessionId: SessionId;
  caseId: CaseId;
  stage: StageSlug;
  /** Scramble that produced the case's state (typically inverse(alg) + AUF). */
  scramble: string;
  /** Time from scramble-shown to first move. */
  recognitionMs: number;
  /** Time from first move to solved state. */
  executionMs: number;
  attemptedAt: number;
  /** Whether the attempt produced the solved state (i.e., user picked the
   *  right alg). */
  correct: boolean;
}
