// localStorage-backed reactive store for timer state: sessions, solves, and
// the currently selected session. Bootstraps a single "Main" session on first
// run. Reactive via Svelte 5 runes — components read fields directly and get
// re-rendered automatically when mutations occur.

import { browser } from "$app/environment";
import type {
  MoveEvent,
  Penalty,
  Session,
  SessionId,
  Solve,
  SolveId,
} from "@cubing/core";

const KEY_SESSIONS = "cubing_sessions";
const KEY_SOLVES = "cubing_solves";
const KEY_CURRENT_SESSION = "cubing_current_session";

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

function newId<T extends string>(): T {
  // crypto.randomUUID is available in all modern browsers and Node 19+.
  return crypto.randomUUID() as T;
}

/** YYYY-MM-DD in the user's local timezone. Used to detect day rollover so
 *  reopening the timer the next morning starts a fresh session. */
function localDateKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

class TimerStore {
  sessions = $state<Session[]>([]);
  solves = $state<Solve[]>([]);
  currentSessionId = $state<SessionId | null>(null);

  constructor() {
    if (!browser) return;
    this.sessions = readJSON<Session[]>(KEY_SESSIONS, []);
    this.solves = readJSON<Solve[]>(KEY_SOLVES, []);

    // One-time migration: strip the legacy "Session " prefix from names.
    let mutated = false;
    this.sessions = this.sessions.map((s) => {
      const m = /^Session (\d+)$/.exec(s.name);
      if (m && m[1]) {
        mutated = true;
        return { ...s, name: m[1] };
      }
      return s;
    });
    if (mutated) writeJSON(KEY_SESSIONS, this.sessions);

    // Bootstrap a default session on first run.
    if (this.sessions.length === 0) {
      this.sessions = [this.makeSession()];
      writeJSON(KEY_SESSIONS, this.sessions);
    }

    // If the most-recent session was created on a different local date,
    // auto-start a new one so daily sessions stay distinct without the user
    // having to remember to click "+ new".
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

  // ---- queries ----

  currentSessionSolves(): Solve[] {
    const id = this.currentSessionId;
    if (!id) return [];
    return this.solves
      .filter((s) => s.sessionId === id)
      .sort((a, b) => b.startedAt - a.startedAt);
  }

  // ---- mutations ----

  addSolve(input: {
    scramble: string;
    durationMs: number;
    penalty: Penalty;
    startedAt?: number;
    moveStream?: MoveEvent[];
  }): Solve | undefined {
    const sessionId = this.currentSessionId;
    if (!sessionId) return undefined;
    const solve: Solve = {
      id: newId<SolveId>(),
      sessionId,
      startedAt: input.startedAt ?? Date.now(),
      durationMs: input.durationMs,
      scramble: input.scramble,
      penalty: input.penalty,
      ...(input.moveStream ? { moveStream: input.moveStream } : {}),
    };
    this.solves = [...this.solves, solve];
    writeJSON(KEY_SOLVES, this.solves);
    return solve;
  }

  setPenalty(id: SolveId, penalty: Penalty): void {
    this.solves = this.solves.map((s) =>
      s.id === id ? { ...s, penalty } : s,
    );
    writeJSON(KEY_SOLVES, this.solves);
  }

  deleteSolve(id: SolveId): void {
    this.solves = this.solves.filter((s) => s.id !== id);
    writeJSON(KEY_SOLVES, this.solves);
  }

  // ---- session mutations ----

  /** Create a new session named "N" where N is one greater than the
   *  highest existing numbered session. Auto-switches to it. */
  createSession(): Session {
    const session = this.makeSession();
    this.sessions = [...this.sessions, session];
    writeJSON(KEY_SESSIONS, this.sessions);
    this.setCurrentSession(session.id);
    return session;
  }

  private nextSessionNumber(): number {
    let max = 0;
    for (const s of this.sessions) {
      const n = Number.parseInt(s.name, 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
    return max + 1;
  }

  setCurrentSession(id: SessionId): void {
    if (!this.sessions.some((s) => s.id === id)) return;
    this.currentSessionId = id;
    writeJSON(KEY_CURRENT_SESSION, id);
  }

  /** Delete a session and cascade-delete its solves. Refuses to delete the
   *  last remaining session — there must always be at least one. */
  deleteSession(id: SessionId): void {
    if (this.sessions.length <= 1) return;
    this.sessions = this.sessions.filter((s) => s.id !== id);
    this.solves = this.solves.filter((s) => s.sessionId !== id);
    writeJSON(KEY_SESSIONS, this.sessions);
    writeJSON(KEY_SOLVES, this.solves);
    if (this.currentSessionId === id) {
      const nextId = this.sessions[0]?.id ?? null;
      this.currentSessionId = nextId;
      writeJSON(KEY_CURRENT_SESSION, nextId);
    }
  }

  // ---- export ----

  /** Snapshot of every session and solve, suitable for download. Session
   *  `id` is the UUID — external tools can dedupe on it. */
  exportSnapshot(): {
    exportedAt: number;
    version: 1;
    sessions: Session[];
    solves: Solve[];
  } {
    return {
      exportedAt: Date.now(),
      version: 1,
      sessions: this.sessions,
      solves: this.solves,
    };
  }
}

export const timerStore = new TimerStore();
