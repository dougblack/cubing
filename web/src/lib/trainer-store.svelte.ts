// localStorage-backed reactive store for trainer attempts AND trainer
// sessions. Mirrors the timer-store pattern: a `Session[]` with a
// currently-selected id, an `Attempt[]` keyed back to a session, and a
// `grouped` derived map for O(1) per-case stats lookup. Same per-day
// auto-rollover behavior as the timer.

import { browser } from "$app/environment";
import {
  median,
  type Session,
  type SessionId,
  type TrainerAttempt,
  type TrainerAttemptId,
  type TrainerStage,
} from "@cubing/core";

const KEY_ATTEMPTS = "cubing_trainer_attempts";
const KEY_SESSIONS = "cubing_trainer_sessions";
const KEY_CURRENT_SESSION = "cubing_trainer_current_session";

function readJSON<T>(key: string, fallback: T): T {
  if (!browser) return fallback;
  const raw = window.localStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown): void {
  if (!browser) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

/** `crypto.randomUUID()` is only available in secure contexts (https,
 *  localhost, or file://). Local-network dev URLs (http://192.168.x.x)
 *  do not qualify — the call throws and the trainer flow breaks on the
 *  first recorded attempt. Fall back to a v4-shaped Math.random id so
 *  the trainer keeps working in dev. */
function newId<T extends string>(): T {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID() as T;
    } catch {
      // Fall through.
    }
  }
  const hex = (n: number) =>
    Math.floor(Math.random() * 16 ** n)
      .toString(16)
      .padStart(n, "0");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${hex(3)}-${hex(12)}` as T;
}

/** YYYY-MM-DD in the user's local timezone. Day-rollover trigger. */
function localDateKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface CaseStats {
  attempts: number;
  /** Subset of `attempts` that were DNF'd (correct === false). */
  dnfs: number;
  /** Median recognition time across non-DNF attempts. null if no data. */
  medianRecognitionMs: number | null;
  /** Median execution time across non-DNF attempts. null if no data. */
  medianExecutionMs: number | null;
  lastAttemptedAt: number | null;
}

const EMPTY_STATS: CaseStats = {
  attempts: 0,
  dnfs: 0,
  medianRecognitionMs: null,
  medianExecutionMs: null,
  lastAttemptedAt: null,
};

function groupKey(stage: string, caseId: string): string {
  return `${stage}:${caseId}`;
}

class TrainerStore {
  attempts = $state<TrainerAttempt[]>([]);
  sessions = $state<Session[]>([]);
  currentSessionId = $state<SessionId | null>(null);

  constructor() {
    if (!browser) return;
    this.attempts = readJSON<TrainerAttempt[]>(KEY_ATTEMPTS, []);
    this.sessions = readJSON<Session[]>(KEY_SESSIONS, []);

    // Bootstrap a session on first run.
    if (this.sessions.length === 0) {
      this.sessions = [this.makeSession()];
      writeJSON(KEY_SESSIONS, this.sessions);
    }

    // Legacy migration: attempts persisted before sessions existed
    // don't carry a sessionId. Assign them all to the oldest session
    // so historical stats survive the upgrade.
    const oldest = [...this.sessions].sort(
      (a, b) => a.createdAt - b.createdAt,
    )[0]!;
    let migrated = false;
    this.attempts = this.attempts.map((a) => {
      if (a.sessionId) return a;
      migrated = true;
      return { ...a, sessionId: oldest.id };
    });
    if (migrated) writeJSON(KEY_ATTEMPTS, this.attempts);

    // Daily auto-rollover: if the most recent session was created on a
    // different local date, start a fresh one. Matches timer behavior.
    const latest = [...this.sessions].sort(
      (a, b) => b.createdAt - a.createdAt,
    )[0]!;
    if (localDateKey(latest.createdAt) !== localDateKey(Date.now())) {
      const fresh = this.makeSession();
      this.sessions = [...this.sessions, fresh];
      writeJSON(KEY_SESSIONS, this.sessions);
      this.currentSessionId = fresh.id;
      writeJSON(KEY_CURRENT_SESSION, fresh.id);
      return;
    }

    const persisted = readJSON<SessionId | null>(KEY_CURRENT_SESSION, null);
    this.currentSessionId =
      persisted && this.sessions.some((s) => s.id === persisted)
        ? persisted
        : (this.sessions[0]?.id ?? null);
  }

  private makeSession(): Session {
    return {
      id: newId<SessionId>(),
      name: String(this.nextSessionNumber()),
      createdAt: Date.now(),
    };
  }

  private nextSessionNumber(): number {
    let max = 0;
    for (const s of this.sessions) {
      const n = Number.parseInt(s.name, 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
    return max + 1;
  }

  /** Single-pass grouping of CURRENT-SESSION attempts by (stage, caseId)
   *  → CaseStats. Reactive on attempts AND currentSessionId — switching
   *  sessions re-derives instantly. Per-case stats are then O(1) lookups
   *  for the case-stats table render. */
  private grouped = $derived.by(() => {
    const out = new Map<string, CaseStats>();
    const sid = this.currentSessionId;
    if (!sid) return out;
    const buckets = new Map<
      string,
      {
        attempts: number;
        dnfs: number;
        rec: number[];
        exec: number[];
        last: number;
      }
    >();
    for (const a of this.attempts) {
      if (a.sessionId !== sid) continue;
      const k = groupKey(a.stage, a.caseId);
      let b = buckets.get(k);
      if (!b) {
        b = { attempts: 0, dnfs: 0, rec: [], exec: [], last: 0 };
        buckets.set(k, b);
      }
      b.attempts++;
      if (a.correct) {
        b.rec.push(a.recognitionMs);
        b.exec.push(a.executionMs);
      } else {
        b.dnfs++;
      }
      // Attempts append in chronological order; the last one we see is
      // the most recent.
      b.last = a.attemptedAt;
    }
    for (const [k, b] of buckets) {
      out.set(k, {
        attempts: b.attempts,
        dnfs: b.dnfs,
        medianRecognitionMs: median(b.rec),
        medianExecutionMs: median(b.exec),
        lastAttemptedAt: b.last,
      });
    }
    return out;
  });

  addAttempt(input: {
    caseId: string;
    stage: TrainerStage;
    scramble: string;
    recognitionMs: number;
    executionMs: number;
    correct: boolean;
  }): TrainerAttempt | undefined {
    const sessionId = this.currentSessionId;
    if (!sessionId) return undefined;
    const attempt: TrainerAttempt = {
      id: newId<TrainerAttemptId>(),
      sessionId,
      caseId: input.caseId,
      stage: input.stage,
      scramble: input.scramble,
      recognitionMs: input.recognitionMs,
      executionMs: input.executionMs,
      attemptedAt: Date.now(),
      correct: input.correct,
    };
    this.attempts = [...this.attempts, attempt];
    writeJSON(KEY_ATTEMPTS, this.attempts);
    return attempt;
  }

  /** Per-case aggregate for the current session over `correct`
   *  attempts only. O(1) — backed by the `grouped` derived map. */
  statsFor(stage: TrainerStage, caseId: string): CaseStats {
    return this.grouped.get(groupKey(stage, caseId)) ?? EMPTY_STATS;
  }

  // ---- session mutations ----

  createSession(): Session {
    const session = this.makeSession();
    this.sessions = [...this.sessions, session];
    writeJSON(KEY_SESSIONS, this.sessions);
    this.setCurrentSession(session.id);
    return session;
  }

  setCurrentSession(id: SessionId): void {
    if (!this.sessions.some((s) => s.id === id)) return;
    this.currentSessionId = id;
    writeJSON(KEY_CURRENT_SESSION, id);
  }

  /** Delete a session and cascade-delete its attempts. Refuses to delete
   *  the last remaining session — there must always be at least one. */
  deleteSession(id: SessionId): void {
    if (this.sessions.length <= 1) return;
    this.sessions = this.sessions.filter((s) => s.id !== id);
    this.attempts = this.attempts.filter((a) => a.sessionId !== id);
    writeJSON(KEY_SESSIONS, this.sessions);
    writeJSON(KEY_ATTEMPTS, this.attempts);
    if (this.currentSessionId === id) {
      const nextId = this.sessions[0]?.id ?? null;
      this.currentSessionId = nextId;
      writeJSON(KEY_CURRENT_SESSION, nextId);
    }
  }

  /** Wipe everything. Intended for a future "reset trainer stats" UI;
   *  for now it's just a clean tear-down for the test harness. Keeps
   *  one fresh session so the store invariant holds. */
  clearAll(): void {
    const fresh = this.makeSession();
    this.attempts = [];
    this.sessions = [fresh];
    this.currentSessionId = fresh.id;
    writeJSON(KEY_ATTEMPTS, []);
    writeJSON(KEY_SESSIONS, this.sessions);
    writeJSON(KEY_CURRENT_SESSION, fresh.id);
  }
}

export const trainerStore = new TrainerStore();
