// Repository interfaces. Each entity has a CRUD-style protocol that platform
// code implements: web/ wires these to localStorage now (and SQLite-WASM
// later); the iOS app would implement them against CoreData / SwiftData.
//
// Interfaces are async even when the local implementation is sync, so a
// future remote-backed implementation slots in without changing call sites.

import type {
  AlgPreference,
  CaseId,
  Session,
  SessionId,
  Solve,
  SolveId,
  TrainerAttempt,
  TrainerAttemptId,
} from "./entities.js";

/** Patch type for partial updates. Omit immutable fields (`id`). */
type Patch<T extends { id: unknown }> = Partial<Omit<T, "id">>;

export interface SolveRepository {
  insert(solve: Omit<Solve, "id">): Promise<Solve>;
  get(id: SolveId): Promise<Solve | undefined>;
  listBySession(sessionId: SessionId): Promise<Solve[]>;
  update(id: SolveId, patch: Patch<Solve>): Promise<Solve>;
  delete(id: SolveId): Promise<void>;
}

export interface SessionRepository {
  insert(session: Omit<Session, "id">): Promise<Session>;
  get(id: SessionId): Promise<Session | undefined>;
  list(): Promise<Session[]>;
  update(id: SessionId, patch: Patch<Session>): Promise<Session>;
  delete(id: SessionId): Promise<void>;
}

export interface AlgPreferenceRepository {
  /** Returns the full map: caseId → preferred index. Bulk access is the
   *  common path (rendering a case list needs every preference). */
  all(): Promise<Record<CaseId, number>>;
  get(caseId: CaseId): Promise<AlgPreference | undefined>;
  set(pref: AlgPreference): Promise<void>;
  delete(caseId: CaseId): Promise<void>;
}

export interface TrainerAttemptRepository {
  insert(attempt: Omit<TrainerAttempt, "id">): Promise<TrainerAttempt>;
  listByCase(caseId: CaseId): Promise<TrainerAttempt[]>;
  /** Median executionMs across attempts for a case. Useful for surfacing
   *  per-alg execution time on the case detail page. */
  medianExecutionMs(caseId: CaseId): Promise<number | undefined>;
}
