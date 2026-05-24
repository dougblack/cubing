// Per-case state in browser storage.
//   state[caseId]: 1 = learning, 2 = learned (absent = unlearned)
//   pref[caseId]:  index of the user's preferred algorithm for that case
//
// Storage: localStorage under "cubing_state" as JSON. On first load, if the
// localStorage entry is missing and a legacy "cubing_state" cookie is present
// (from the pre-SvelteKit Jinja site), its contents are migrated and the
// cookie is left untouched.

import { browser } from "$app/environment";

const STORAGE_KEY = "cubing_state";
const COOKIE_NAME = "cubing_state";

type LearningState = 1 | 2;

interface PersistedShape {
  state?: Record<string, LearningState>;
  pref?: Record<string, number>;
}

function readLegacyCookie(): PersistedShape | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(COOKIE_NAME + "="));
  if (!match) return null;
  try {
    const raw = JSON.parse(
      decodeURIComponent(match.slice(COOKIE_NAME.length + 1)),
    );
    if (raw && (raw.state !== undefined || raw.pref !== undefined)) {
      return { state: raw.state ?? {}, pref: raw.pref ?? {} };
    }
    // Legacy-legacy: top-level was the state map.
    return { state: raw ?? {}, pref: {} };
  } catch {
    return null;
  }
}

function readInitial(): PersistedShape {
  if (!browser) return { state: {}, pref: {} };
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as PersistedShape;
      return { state: parsed.state ?? {}, pref: parsed.pref ?? {} };
    } catch {
      // fall through
    }
  }
  return readLegacyCookie() ?? { state: {}, pref: {} };
}

class CubingState {
  state = $state<Record<string, LearningState>>({});
  pref = $state<Record<string, number>>({});

  constructor() {
    const initial = readInitial();
    this.state = initial.state ?? {};
    this.pref = initial.pref ?? {};
  }

  private persist(): void {
    if (!browser) return;
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: this.state, pref: this.pref }),
    );
  }

  /** Cycle: unlearned → learning → learned → unlearned. Returns the new code. */
  cycleState(caseId: string): 0 | 1 | 2 {
    const current = this.state[caseId] ?? 0;
    const next = ((current + 1) % 3) as 0 | 1 | 2;
    if (next === 0) delete this.state[caseId];
    else this.state[caseId] = next;
    this.persist();
    return next;
  }

  /** Set the preferred-alg index for a case; toggling the same one clears it. */
  togglePref(caseId: string, algIndex: number): number | undefined {
    if (this.pref[caseId] === algIndex) {
      delete this.pref[caseId];
    } else {
      this.pref[caseId] = algIndex;
    }
    this.persist();
    return this.pref[caseId];
  }

  /** Count of cases marked `learned` (state === 2) within the given roster. */
  learnedCount(caseIds: readonly string[]): number {
    let n = 0;
    for (const id of caseIds) if (this.state[id] === 2) n++;
    return n;
  }
}

export const cubingState = new CubingState();
