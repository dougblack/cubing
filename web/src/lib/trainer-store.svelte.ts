// localStorage-backed reactive store for trainer attempts. One flat
// `TrainerAttempt[]` keyed by `cubing_trainer_attempts`; per-case stats
// are derived via a single grouped index so the trainer page can call
// `statsFor` once per case in a render loop without re-walking the
// whole attempt list each time. Same persistence pattern as
// timer-store.svelte.ts.

import { browser } from "$app/environment";
import {
  median,
  type TrainerAttempt,
  type TrainerAttemptId,
  type TrainerStage,
} from "@cubing/core";

const KEY = "cubing_trainer_attempts";

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
function newId(): TrainerAttemptId {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    try {
      return crypto.randomUUID() as TrainerAttemptId;
    } catch {
      // Fall through.
    }
  }
  const hex = (n: number) =>
    Math.floor(Math.random() * 16 ** n)
      .toString(16)
      .padStart(n, "0");
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${hex(3)}-${hex(12)}` as TrainerAttemptId;
}

export interface CaseStats {
  attempts: number;
  /** Median recognition time across non-DNF attempts. null if no data. */
  medianRecognitionMs: number | null;
  /** Median execution time across non-DNF attempts. null if no data. */
  medianExecutionMs: number | null;
  lastAttemptedAt: number | null;
}

const EMPTY_STATS: CaseStats = {
  attempts: 0,
  medianRecognitionMs: null,
  medianExecutionMs: null,
  lastAttemptedAt: null,
};

function groupKey(stage: string, caseId: string): string {
  return `${stage}:${caseId}`;
}

class TrainerStore {
  attempts = $state<TrainerAttempt[]>([]);

  constructor() {
    if (!browser) return;
    this.attempts = readJSON<TrainerAttempt[]>(KEY, []);
  }

  /** Single-pass grouping of attempts by (stage, caseId) → CaseStats.
   *  Computed once per attempts-array change; `statsFor` is then an O(1)
   *  Map lookup. Without this, rendering the case-stats table did
   *  O(cases × attempts) work per render. */
  private grouped = $derived.by(() => {
    const out = new Map<string, CaseStats>();
    const buckets = new Map<
      string,
      {
        attempts: number;
        rec: number[];
        exec: number[];
        last: number;
      }
    >();
    for (const a of this.attempts) {
      const k = groupKey(a.stage, a.caseId);
      let b = buckets.get(k);
      if (!b) {
        b = { attempts: 0, rec: [], exec: [], last: 0 };
        buckets.set(k, b);
      }
      b.attempts++;
      if (a.correct) {
        b.rec.push(a.recognitionMs);
        b.exec.push(a.executionMs);
      }
      // Attempts append in chronological order; the last one we see is
      // the most recent.
      b.last = a.attemptedAt;
    }
    for (const [k, b] of buckets) {
      out.set(k, {
        attempts: b.attempts,
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
  }): TrainerAttempt {
    const attempt: TrainerAttempt = {
      id: newId(),
      caseId: input.caseId,
      stage: input.stage,
      scramble: input.scramble,
      recognitionMs: input.recognitionMs,
      executionMs: input.executionMs,
      attemptedAt: Date.now(),
      correct: input.correct,
    };
    this.attempts = [...this.attempts, attempt];
    writeJSON(KEY, this.attempts);
    return attempt;
  }

  /** Per-case aggregate over `correct` attempts only. O(1) — backed by
   *  the `grouped` derived map. */
  statsFor(stage: TrainerStage, caseId: string): CaseStats {
    return this.grouped.get(groupKey(stage, caseId)) ?? EMPTY_STATS;
  }

  /** Wipe all attempts. Intended for a future "reset trainer stats" UI;
   *  for now it's just a clean tear-down for the test harness. */
  clearAll(): void {
    this.attempts = [];
    writeJSON(KEY, []);
  }
}

export const trainerStore = new TrainerStore();
