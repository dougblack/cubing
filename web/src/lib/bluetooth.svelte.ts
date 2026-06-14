/// <reference types="web-bluetooth" />
// Web Bluetooth integration for GAN smart cubes via gan-web-bluetooth.
//
// Reactive store that owns the cube connection. Components read `status`,
// `deviceName`, `batteryPct`, `recentMoves` for display, and subscribe via
// `onMove` / `onSolved` for solve-recording and auto-stop.
//
// Web Bluetooth only works in Chromium-based browsers and only over HTTPS or
// localhost. On unsupported browsers `isAvailable()` returns false and the
// connect button should be hidden / disabled.

import { browser } from "$app/environment";
import {
  type GanCubeConnection,
  type GanCubeEvent,
  connectGanCube,
} from "gan-web-bluetooth";
import type { Subscription } from "rxjs";

// ---- MAC address handling ----
//
// GAN cubes encrypt their Bluetooth protocol with a key derived from the
// cube's MAC address. The Web Bluetooth API doesn't expose MAC addresses to
// pages, and only Chrome (with experimental flags) supports the
// watchAdvertisements() workaround the library uses to auto-detect. Every
// other path requires the user to supply the MAC manually — same approach
// csTimer takes.
//
// We cache MACs in localStorage keyed by the cube's device name so the
// prompt only appears once per cube.

const KEY_CUBE_MACS = "cubing_cube_macs";
const MAC_REGEX = /^([0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}$/;

function readMacCache(): Record<string, string> {
  if (!browser) return {};
  const raw = window.localStorage.getItem(KEY_CUBE_MACS);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function writeMacCache(map: Record<string, string>): void {
  if (!browser) return;
  window.localStorage.setItem(KEY_CUBE_MACS, JSON.stringify(map));
}

function normalizeMac(input: string): string | null {
  const trimmed = input.trim();
  if (!MAC_REGEX.test(trimmed)) return null;
  return trimmed.toUpperCase().replace(/-/g, ":");
}

/** GAN cubes broadcast the last 2 bytes of their MAC as the suffix of the
 *  device name, e.g. "GANi4_9D65" → MAC must end with ...:9D:65. Returns
 *  the 4 expected hex chars (uppercase, no separator) or null if the name
 *  doesn't fit the convention. */
function expectedMacSuffix(deviceName: string): string | null {
  const m = /([0-9A-Fa-f]{4})$/.exec(deviceName);
  return m ? m[1]!.toUpperCase() : null;
}

/** True if the MAC's last 4 hex chars match the device-name suffix. If the
 *  device name doesn't include a recognizable suffix, this returns true
 *  (we have nothing to check against). */
function macMatchesDeviceName(mac: string, deviceName: string): boolean {
  const expected = expectedMacSuffix(deviceName);
  if (!expected) return true;
  const actual = mac.replace(/[:-]/g, "").slice(-4).toUpperCase();
  return actual === expected;
}

/** Build a MacAddressProvider closure that also logs which value it returned —
 *  the right MAC is the load-bearing prerequisite for the cube responding at
 *  all, so the log entry is the first thing to check when events don't arrive. */
function makeMacAddressProvider(log: (msg: string) => void) {
  function checkSuffix(mac: string, deviceName: string): void {
    const expected = expectedMacSuffix(deviceName);
    if (expected && !macMatchesDeviceName(mac, deviceName)) {
      const actual = mac.replace(/[:-]/g, "").slice(-4).toUpperCase();
      log(
        `WARNING: MAC ${mac} ends in :${actual.slice(0, 2)}:${actual.slice(2)} but device name "${deviceName}" expects :${expected.slice(0, 2)}:${expected.slice(2)}. ` +
          "The cube will not respond meaningfully. Click 'forget MAC' and re-enter the correct MAC.",
      );
    }
  }

  return async (
    device: BluetoothDevice,
    isFallbackCall?: boolean,
  ): Promise<string | null> => {
    const cache = readMacCache();
    const key = device.name ?? "";
    const cached = cache[key];

    // First call: hand back a cached MAC if we have one. Returning null lets
    // the library try its own watchAdvertisements path before we get a
    // fallback call.
    if (!isFallbackCall) {
      if (cached) {
        log(`MAC provider: returning cached ${cached} for "${key}"`);
        checkSuffix(cached, key);
      } else {
        log(`MAC provider: no cached MAC for "${key}", letting library auto-detect`);
      }
      return cached ?? null;
    }

    // Fallback call: library couldn't auto-detect, so we have to ask the user.
    if (cached) {
      log(`MAC provider (fallback): returning cached ${cached}`);
      checkSuffix(cached, key);
      return cached;
    }
    const hint = expectedMacSuffix(key);
    const hintLine = hint
      ? `\nFrom the device name "${key}", the last 2 bytes must be ${hint.slice(0, 2)}:${hint.slice(2)}.\n` +
        `Find the first 4 bytes in the GAN Smart app (Settings → About Cube) and enter the full MAC: XX:XX:XX:XX:${hint.slice(0, 2)}:${hint.slice(2)}`
      : `Find it in the GAN Smart app (Settings → About Cube) or on the cube/box.\nFormat: AA:BB:CC:DD:EE:FF`;
    const prompt = window.prompt(
      `Couldn't auto-detect the MAC address for "${key || "this cube"}".\n\n` +
        hintLine +
        `\n\n(Saved locally so this only happens once per cube.)`,
      hint ? `XX:XX:XX:XX:${hint.slice(0, 2)}:${hint.slice(2)}` : "",
    );
    if (!prompt) {
      log("MAC provider (fallback): user cancelled");
      return null;
    }
    const mac = normalizeMac(prompt);
    if (!mac) {
      log(`MAC provider (fallback): rejected "${prompt}" (bad format)`);
      window.alert("Invalid MAC address format. Expected AA:BB:CC:DD:EE:FF.");
      return null;
    }
    if (hint && !macMatchesDeviceName(mac, key)) {
      const actual = mac.replace(/[:-]/g, "").slice(-4).toUpperCase();
      const confirmed = window.confirm(
        `The MAC you entered ends in :${actual.slice(0, 2)}:${actual.slice(2)}, but the device name "${key}" suggests it should end in :${hint.slice(0, 2)}:${hint.slice(2)}.\n\n` +
          `This MAC will probably not work. Save it anyway?`,
      );
      if (!confirmed) {
        log(
          `MAC provider (fallback): user re-entered after suffix-mismatch warning`,
        );
        return null;
      }
    }
    cache[key] = mac;
    writeMacCache(cache);
    log(`MAC provider (fallback): user entered ${mac}, cached for "${key}"`);
    return mac;
  };
}

/** Drop the cached MAC for every paired cube. Use when a cached value is
 *  wrong (e.g. user mistyped) and connecting yields garbled state. */
export function forgetCachedCubeMacs(): void {
  if (!browser) return;
  window.localStorage.removeItem(KEY_CUBE_MACS);
}

type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

/** Kociemba notation for a solved 3x3: nine of each face in U-R-F-D-L-B order. */
const SOLVED_FACELETS =
  "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";

/** True iff the cube's structured state (CP/CO/EP/EO) is the solved
 *  identity: corners and edges in their home positions, all orientations
 *  zero. Independent of the facelets string. */
function isStateSolved(state: {
  CP: number[];
  CO: number[];
  EP: number[];
  EO: number[];
}): boolean {
  for (let i = 0; i < 8; i++) {
    if (state.CP[i] !== i) return false;
    if (state.CO[i] !== 0) return false;
  }
  for (let i = 0; i < 12; i++) {
    if (state.EP[i] !== i) return false;
    if (state.EO[i] !== 0) return false;
  }
  return true;
}

/** How many recent moves to keep around for the on-screen ticker. */
const RECENT_CAPACITY = 16;
/** How many entries to keep in the debug log before FIFO-evicting. */
const DEBUG_LOG_CAPACITY = 500;

function logTimestamp(): string {
  // HH:MM:SS.sss
  return new Date().toISOString().slice(11, 23);
}

export type MoveCallback = (move: string, tMs: number) => void;
/** Invoked when the cube transitions to solved. `lastMoveAt` is the
 *  `performance.now()` of the move that *put* the cube into the solved
 *  state (i.e. the cube's `localTimestamp` from the most recent MOVE
 *  event). Use this as the timer endpoint instead of "now" — the FACELETS
 *  event that triggers SOLVED arrives a few hundred ms after the move,
 *  so timing off "now" overcounts. Null only if no MOVE event has fired
 *  this session (shouldn't happen in normal play). */
export type SolvedCallback = (lastMoveAt: number | null) => void;
/** Invoked on every FACELETS event with the 54-char Kociemba string and
 *  the same `lastMoveAt` as `SolvedCallback`. Useful for stage-specific
 *  completion detection (e.g. OLL: just the top face oriented, not the
 *  whole cube). Fires on every cube state update, so callers must do
 *  their own transition / debounce as needed. */
export type FaceletsCallback = (
  facelets: string,
  lastMoveAt: number | null,
) => void;

class BluetoothStore {
  status = $state<ConnectionStatus>("disconnected");
  deviceName = $state<string | null>(null);
  batteryPct = $state<number | null>(null);
  recentMoves = $state<string[]>([]);
  errorMessage = $state<string | null>(null);
  /** Raw event log for debugging connection drops, missed events, etc.
   *  GYRO events are intentionally suppressed — they'd fire at ~30Hz and
   *  bury everything else. */
  debugLog = $state<string[]>([]);

  private connection: GanCubeConnection | null = null;
  private subscription: Subscription | null = null;
  private moveListeners = new Set<MoveCallback>();
  private solvedListeners = new Set<SolvedCallback>();
  private faceletsListeners = new Set<FaceletsCallback>();
  private lastFaceletsWasSolved = false;
  /** performance.now()-equivalent timestamp of the most recent MOVE event.
   *  Used as the authoritative timer endpoint when the cube fires SOLVED —
   *  beats waiting for the FACELETS event that's lagging behind. */
  private lastMoveAt: number | null = null;
  private gyroLogged = false;
  /** Interval that periodically re-requests the battery level. Some cube
   *  firmware (e.g. GANi4 sw 1.12+) doesn't reliably respond to the first
   *  REQUEST_BATTERY sent during the connect burst — polling gives us a
   *  chance to fill the indicator in once the cube is settled. */
  private batteryPollTimer: ReturnType<typeof setInterval> | null = null;
  private batteryRetryTimer: ReturnType<typeof setTimeout> | null = null;

  isAvailable(): boolean {
    return browser && "bluetooth" in navigator;
  }

  log(message: string): void {
    const entry = `[${logTimestamp()}] ${message}`;
    this.debugLog = [...this.debugLog, entry].slice(-DEBUG_LOG_CAPACITY);
  }

  clearLog(): void {
    this.debugLog = [];
  }

  async connect(): Promise<void> {
    if (!browser) return;
    if (this.status === "connecting" || this.status === "connected") return;

    this.status = "connecting";
    this.errorMessage = null;
    this.gyroLogged = false;
    this.log("connect: requesting device…");

    const provider = makeMacAddressProvider((msg) => this.log(msg));

    try {
      this.connection = await connectGanCube(provider);
      this.deviceName = this.connection.deviceName;
      this.status = "connected";
      // Treat the cube as solved on connect. The user almost always picks up
      // a solved cube before opening the timer, and assuming-solved means
      // the first FACELETS event won't fire a stray "solved!" callback that
      // would stop the timer before they even started.
      this.lastFaceletsWasSolved = true;
      this.log(`connect: connected to ${this.connection.deviceName} (assumed solved)`);
      this.subscription = this.connection.events$.subscribe({
        next: (evt) => this.handleEvent(evt),
        error: (err) => {
          this.log(`events$ error: ${err?.message ?? String(err)}`);
        },
        complete: () => {
          this.log("events$ completed");
        },
      });
      // GATT operations are serialized at the browser layer; firing these in
      // parallel produces "GATT operation already in progress" on the 2nd/3rd.
      // Await each one.
      await this.sendCommand("REQUEST_HARDWARE");
      await this.sendCommand("REQUEST_BATTERY");
      await this.sendCommand("REQUEST_FACELETS");

      // Some firmware swallows the first REQUEST_BATTERY mid-handshake.
      // Retry a few seconds later, and poll every minute afterwards to
      // keep the indicator fresh during long sessions.
      this.batteryRetryTimer = setTimeout(() => {
        if (this.batteryPct === null) {
          this.log("BATTERY retry (no response to initial request)");
          this.sendCommand("REQUEST_BATTERY");
        }
      }, 4000);
      this.batteryPollTimer = setInterval(() => {
        this.sendCommand("REQUEST_BATTERY");
      }, 60_000);
    } catch (err) {
      this.status = "error";
      this.errorMessage = (err as Error).message ?? "Failed to connect";
      this.log(`connect: failed: ${this.errorMessage}`);
      this.connection = null;
    }
  }

  private async sendCommand(
    type: "REQUEST_HARDWARE" | "REQUEST_BATTERY" | "REQUEST_FACELETS" | "REQUEST_RESET",
  ): Promise<void> {
    if (!this.connection) return;
    try {
      await this.connection.sendCubeCommand({ type });
      this.log(`${type} sent`);
    } catch (e) {
      this.log(`${type} failed: ${(e as Error).message ?? e}`);
    }
  }

  /** Tell the cube to treat its current physical state as solved — useful
   *  when the cube's tracked state has desynced from reality (e.g. the cube
   *  was reassembled or moved while disconnected). Call this with the cube
   *  physically solved in front of you. Also re-requests the facelets so
   *  the UI reflects the reset immediately. */
  async resetCubeState(): Promise<void> {
    this.lastFaceletsWasSolved = false;
    await this.sendCommand("REQUEST_RESET");
    await this.sendCommand("REQUEST_FACELETS");
  }

  async disconnect(): Promise<void> {
    this.log("disconnect: requested");
    if (this.batteryRetryTimer) {
      clearTimeout(this.batteryRetryTimer);
      this.batteryRetryTimer = null;
    }
    if (this.batteryPollTimer) {
      clearInterval(this.batteryPollTimer);
      this.batteryPollTimer = null;
    }
    if (this.subscription) {
      this.subscription.unsubscribe();
      this.subscription = null;
    }
    if (this.connection) {
      try {
        await this.connection.disconnect();
      } catch (e) {
        this.log(`disconnect: ${(e as Error).message ?? e}`);
      }
      this.connection = null;
    }
    this.status = "disconnected";
    this.deviceName = null;
    this.batteryPct = null;
    this.recentMoves = [];
    this.lastFaceletsWasSolved = false;
    this.lastMoveAt = null;
  }

  /** Subscribe to MOVE events. Returns an unsubscribe function. */
  onMove(cb: MoveCallback): () => void {
    this.moveListeners.add(cb);
    return () => {
      this.moveListeners.delete(cb);
    };
  }

  /** Subscribe to "cube transitioned to solved state" events. Fires only on
   *  the transition (scrambled → solved), not repeatedly while solved. */
  onSolved(cb: SolvedCallback): () => void {
    this.solvedListeners.add(cb);
    return () => {
      this.solvedListeners.delete(cb);
    };
  }

  /** Subscribe to raw FACELETS events. Fires on every cube state update —
   *  no transition / dedupe — so the caller can run custom completion
   *  checks (e.g. "is the top face one color"). */
  onFacelets(cb: FaceletsCallback): () => void {
    this.faceletsListeners.add(cb);
    return () => {
      this.faceletsListeners.delete(cb);
    };
  }

  private handleEvent(evt: GanCubeEvent): void {
    switch (evt.type) {
      case "MOVE": {
        const tMs = evt.localTimestamp ?? performance.now();
        this.lastMoveAt = tMs;
        const move = evt.move;
        this.log(`MOVE ${move} serial=${evt.serial} t=${tMs}`);
        this.recentMoves = [...this.recentMoves, move].slice(-RECENT_CAPACITY);
        for (const cb of this.moveListeners) cb(move, tMs);
        break;
      }
      case "FACELETS": {
        const faceletsSolved = evt.facelets === SOLVED_FACELETS;
        const stateSolved = isStateSolved(evt.state);
        // Backup detector: the GanCubeState (CP/CO/EP/EO) sometimes reports
        // solved when the facelets string doesn't (or vice versa). We treat
        // either signal as authoritative — false-positive solved-detection
        // (timer stops early) is less painful than false-negative (timer
        // never stops, user has to spacebar).
        const nowSolved = faceletsSolved || stateSolved;
        const tag = !nowSolved
          ? ""
          : faceletsSolved && stateSolved
            ? " (solved)"
            : faceletsSolved
              ? " (facelets-solved; state-not-solved)"
              : " (state-solved; facelets-not-solved)";
        this.log(`FACELETS serial=${evt.serial} ${evt.facelets}${tag}`);
        for (const cb of this.faceletsListeners) {
          cb(evt.facelets, this.lastMoveAt);
        }
        if (nowSolved && !this.lastFaceletsWasSolved) {
          for (const cb of this.solvedListeners) cb(this.lastMoveAt);
        }
        this.lastFaceletsWasSolved = nowSolved;
        break;
      }
      case "BATTERY":
        this.log(`BATTERY ${evt.batteryLevel}%`);
        this.batteryPct = evt.batteryLevel;
        break;
      case "HARDWARE":
        this.log(
          `HARDWARE name=${evt.hardwareName ?? "?"} hw=${evt.hardwareVersion ?? "?"} sw=${evt.softwareVersion ?? "?"} prod=${evt.productDate ?? "?"} gyro=${evt.gyroSupported ?? "?"}`,
        );
        break;
      case "DISCONNECT":
        this.log("DISCONNECT (from cube)");
        this.disconnect();
        break;
      case "GYRO":
        // Fires at ~30Hz once the cube is talking. Log the first so we know
        // the protocol is alive; suppress the rest.
        if (!this.gyroLogged) {
          this.log(
            `GYRO (first) q=(${evt.quaternion.x.toFixed(2)}, ${evt.quaternion.y.toFixed(2)}, ${evt.quaternion.z.toFixed(2)}, ${evt.quaternion.w.toFixed(2)}) — subsequent GYRO suppressed`,
          );
          this.gyroLogged = true;
        }
        break;
    }
  }
}

export const bluetoothStore = new BluetoothStore();
