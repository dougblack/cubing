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

class TimerStore {
  sessions = $state<Session[]>([]);
  solves = $state<Solve[]>([]);
  currentSessionId = $state<SessionId | null>(null);

  constructor() {
    if (!browser) return;
    this.sessions = readJSON<Session[]>(KEY_SESSIONS, []);
    this.solves = readJSON<Solve[]>(KEY_SOLVES, []);

    // Bootstrap a default session on first run.
    if (this.sessions.length === 0) {
      const first: Session = {
        id: newId<SessionId>(),
        name: "Session 1",
        createdAt: Date.now(),
      };
      this.sessions = [first];
      writeJSON(KEY_SESSIONS, this.sessions);
    }

    const persisted = readJSON<SessionId | null>(KEY_CURRENT_SESSION, null);
    this.currentSessionId =
      persisted && this.sessions.some((s) => s.id === persisted)
        ? persisted
        : (this.sessions[0]?.id ?? null);
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

  /** Create a new session named "Session N" where N is one greater than the
   *  highest existing Session-numbered session. Auto-switches to it. */
  createSession(): Session {
    const session: Session = {
      id: newId<SessionId>(),
      name: `Session ${this.nextSessionNumber()}`,
      createdAt: Date.now(),
    };
    this.sessions = [...this.sessions, session];
    writeJSON(KEY_SESSIONS, this.sessions);
    this.setCurrentSession(session.id);
    return session;
  }

  private nextSessionNumber(): number {
    let max = 0;
    for (const s of this.sessions) {
      const m = /^Session (\d+)$/.exec(s.name);
      if (m && m[1]) {
        const n = Number.parseInt(m[1], 10);
        if (n > max) max = n;
      }
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
}

export const timerStore = new TimerStore();
