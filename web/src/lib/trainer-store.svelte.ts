// localStorage-backed reactive store for trainer attempts. One flat
// `TrainerAttempt[]` keyed by `cubing_trainer_attempts`; per-case stats
// are derived on demand. Same pattern as timer-store.svelte.ts.

import { browser } from "$app/environment";
import type {
  TrainerAttempt,
  TrainerAttemptId,
  TrainerStage,
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

function newId(): TrainerAttemptId {
  return crypto.randomUUID() as TrainerAttemptId;
}

export interface CaseStats {
  attempts: number;
  /** Median recognition time across non-DNF attempts. null if no data. */
  medianRecognitionMs: number | null;
  /** Median execution time across non-DNF attempts. null if no data. */
  medianExecutionMs: number | null;
  lastAttemptedAt: number | null;
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

class TrainerStore {
  attempts = $state<TrainerAttempt[]>([]);

  constructor() {
    if (!browser) return;
    this.attempts = readJSON<TrainerAttempt[]>(KEY, []);
  }

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

  /** Per-case aggregate over `correct` attempts only. Incorrect attempts
   *  are recorded (for review) but excluded from typical-time metrics
   *  since they don't reflect successful execution. */
  statsFor(stage: TrainerStage, caseId: string): CaseStats {
    const matching = this.attempts.filter(
      (a) => a.stage === stage && a.caseId === caseId,
    );
    const correct = matching.filter((a) => a.correct);
    return {
      attempts: matching.length,
      medianRecognitionMs: median(correct.map((a) => a.recognitionMs)),
      medianExecutionMs: median(correct.map((a) => a.executionMs)),
      lastAttemptedAt:
        matching.length === 0
          ? null
          : Math.max(...matching.map((a) => a.attemptedAt)),
    };
  }

  /** Wipe all attempts. Intended for a future "reset trainer stats" UI;
   *  for now it's just a clean tear-down for the test harness. */
  clearAll(): void {
    this.attempts = [];
    writeJSON(KEY, []);
  }
}

export const trainerStore = new TrainerStore();
