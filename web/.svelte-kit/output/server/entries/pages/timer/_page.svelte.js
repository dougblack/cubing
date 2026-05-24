import { R as attr, a as ensure_array_like, c as stringify, i as derived, n as attr_class, o as head, r as bind_props, z as escape_html } from "../../../chunks/dev.js";
import "../../../chunks/chunk-O6HEZXGY.js";
import "../../../chunks/chunk-FLK6AZKB.js";
import "../../../chunks/chunk-V27EM5TJ.js";
import { t as randomScrambleForEvent } from "../../../chunks/chunk-M7YKTETT.js";
import "gan-web-bluetooth";
//#region ../core/src/scramble.ts
/** Generate a single WCA-legal 3x3 scramble. */
async function next3x3Scramble() {
	return (await randomScrambleForEvent("333")).toString();
}
//#endregion
//#region ../core/src/stats.ts
function effectiveMs(s) {
	if (s.penalty === "DNF") return "DNF";
	return s.durationMs + (s.penalty === "+2" ? 2e3 : 0);
}
/** WCA-style trimmed mean over the most recent `n` solves: drop the single
*  best and single worst, average the middle (n-2) values. A DNF is the
*  "worst" and can be dropped — a second DNF poisons the average to DNF.
*
*  `solvesNewestFirst` is expected to be sorted newest → oldest (matching
*  `timerStore.currentSessionSolves()`). Returns `null` if fewer than n
*  solves are available. */
function averageOfN(solvesNewestFirst, n) {
	if (n < 3) throw new Error(`averageOfN requires n >= 3, got ${n}`);
	if (solvesNewestFirst.length < n) return null;
	const window = solvesNewestFirst.slice(0, n).map(effectiveMs);
	if (window.filter((t) => t === "DNF").length >= 2) return "DNF";
	const middle = [...window.map((t) => t === "DNF" ? Number.POSITIVE_INFINITY : t)].sort((a, b) => a - b).slice(1, -1);
	return middle.reduce((a, b) => a + b, 0) / middle.length;
}
/** Fastest single solve. Returns null if there are no solves; "DNF" if every
*  solve was a DNF. */
function bestSingleMs(solves) {
	if (solves.length === 0) return null;
	let best = null;
	for (const s of solves) {
		const t = effectiveMs(s);
		if (t === "DNF") continue;
		if (best === null || t < best) best = t;
	}
	return best === null ? "DNF" : best;
}
//#endregion
//#region ../core/src/scramble-tracker.ts
var FACE_SET = new Set([
	"U",
	"D",
	"L",
	"R",
	"F",
	"B"
]);
function isCubeFace(s) {
	return FACE_SET.has(s);
}
/** Parse a scramble string into structured moves. Whitespace is the
*  separator; tokens that don't match `<face>[2|']` are skipped silently.
*  WCA scrambles only contain face-only turns, no wide moves / slices /
*  rotations — anything else is a bug in the source. */
function parseScramble(scramble) {
	const out = [];
	for (const tok of scramble.trim().split(/\s+/)) {
		const move = parseMove(tok);
		if (move) out.push(move);
	}
	return out;
}
function parseMove(token) {
	if (token.length === 0) return null;
	const face = token.charAt(0);
	if (!isCubeFace(face)) return null;
	const suffix = token.slice(1);
	if (suffix === "") return {
		face,
		quantity: 1
	};
	if (suffix === "'") return {
		face,
		quantity: -1
	};
	if (suffix === "2") return {
		face,
		quantity: 2
	};
	return null;
}
/** Fresh tracker for a scramble string. Caller passes this around as the
*  authoritative state. */
function newTrackerState(scramble) {
	return {
		steps: parseScramble(scramble),
		currentIndex: 0,
		subProgress: 0,
		subDirection: null
	};
}
/** Pairwise-collapse two adjacent identical quarter turns into a single
*  half turn. `F F → F2`, `R' R' → R2`. Doesn't chain (so `R R R` becomes
*  `R2 R`, not `R'`) and doesn't cancel opposites (`R R'` stays as two
*  moves). The function is intended for display — BT cube events arrive
*  one quarter turn at a time, and collapsing makes a 60-move solve read
*  the way a cuber would write it. */
function collapseDoubleTurns(moves) {
	const out = [];
	for (const move of moves) {
		const prev = out[out.length - 1];
		if (prev !== void 0 && prev === move && !move.endsWith("2")) out[out.length - 1] = move.charAt(0) + "2";
		else out.push(move);
	}
	return out;
}
/** Kociemba notation for a solved 3x3: nine of each face in U-R-F-D-L-B order. */
var SOLVED_FACELETS = "UUUUUUUUURRRRRRRRRFFFFFFFFFDDDDDDDDDLLLLLLLLLBBBBBBBBB";
/** True iff the cube's structured state (CP/CO/EP/EO) is the solved
*  identity: corners and edges in their home positions, all orientations
*  zero. Independent of the facelets string. */
function isStateSolved(state) {
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
function logTimestamp() {
	return (/* @__PURE__ */ new Date()).toISOString().slice(11, 23);
}
var BluetoothStore = class {
	status = "disconnected";
	deviceName = null;
	batteryPct = null;
	recentMoves = [];
	errorMessage = null;
	/** Raw event log for debugging connection drops, missed events, etc.
	*  GYRO events are intentionally suppressed — they'd fire at ~30Hz and
	*  bury everything else. */
	debugLog = [];
	connection = null;
	subscription = null;
	moveListeners = /* @__PURE__ */ new Set();
	solvedListeners = /* @__PURE__ */ new Set();
	lastFaceletsWasSolved = false;
	gyroLogged = false;
	isAvailable() {
		return false;
	}
	log(message) {
		const entry = `[${logTimestamp()}] ${message}`;
		this.debugLog = [...this.debugLog, entry].slice(-500);
	}
	clearLog() {
		this.debugLog = [];
	}
	async connect() {}
	async sendCommand(type) {
		if (!this.connection) return;
		try {
			await this.connection.sendCubeCommand({ type });
			this.log(`${type} sent`);
		} catch (e) {
			this.log(`${type} failed: ${e.message ?? e}`);
		}
	}
	/** Tell the cube to treat its current physical state as solved — useful
	*  when the cube's tracked state has desynced from reality (e.g. the cube
	*  was reassembled or moved while disconnected). Call this with the cube
	*  physically solved in front of you. Also re-requests the facelets so
	*  the UI reflects the reset immediately. */
	async resetCubeState() {
		this.lastFaceletsWasSolved = false;
		await this.sendCommand("REQUEST_RESET");
		await this.sendCommand("REQUEST_FACELETS");
	}
	async disconnect() {
		this.log("disconnect: requested");
		if (this.subscription) {
			this.subscription.unsubscribe();
			this.subscription = null;
		}
		if (this.connection) {
			try {
				await this.connection.disconnect();
			} catch (e) {
				this.log(`disconnect: ${e.message ?? e}`);
			}
			this.connection = null;
		}
		this.status = "disconnected";
		this.deviceName = null;
		this.batteryPct = null;
		this.recentMoves = [];
		this.lastFaceletsWasSolved = false;
	}
	/** Subscribe to MOVE events. Returns an unsubscribe function. */
	onMove(cb) {
		this.moveListeners.add(cb);
		return () => {
			this.moveListeners.delete(cb);
		};
	}
	/** Subscribe to "cube transitioned to solved state" events. Fires only on
	*  the transition (scrambled → solved), not repeatedly while solved. */
	onSolved(cb) {
		this.solvedListeners.add(cb);
		return () => {
			this.solvedListeners.delete(cb);
		};
	}
	handleEvent(evt) {
		switch (evt.type) {
			case "MOVE": {
				const tMs = evt.localTimestamp ?? performance.now();
				const move = evt.move;
				this.log(`MOVE ${move} serial=${evt.serial} t=${tMs}`);
				this.recentMoves = [...this.recentMoves, move].slice(-16);
				for (const cb of this.moveListeners) cb(move, tMs);
				break;
			}
			case "FACELETS": {
				const faceletsSolved = evt.facelets === SOLVED_FACELETS;
				const stateSolved = isStateSolved(evt.state);
				const nowSolved = faceletsSolved || stateSolved;
				const tag = !nowSolved ? "" : faceletsSolved && stateSolved ? " (solved)" : faceletsSolved ? " (facelets-solved; state-not-solved)" : " (state-solved; facelets-not-solved)";
				this.log(`FACELETS serial=${evt.serial} ${evt.facelets}${tag}`);
				if (nowSolved && !this.lastFaceletsWasSolved) for (const cb of this.solvedListeners) cb();
				this.lastFaceletsWasSolved = nowSolved;
				break;
			}
			case "BATTERY":
				this.log(`BATTERY ${evt.batteryLevel}%`);
				this.batteryPct = evt.batteryLevel;
				break;
			case "HARDWARE":
				this.log(`HARDWARE name=${evt.hardwareName ?? "?"} hw=${evt.hardwareVersion ?? "?"} sw=${evt.softwareVersion ?? "?"} prod=${evt.productDate ?? "?"} gyro=${evt.gyroSupported ?? "?"}`);
				break;
			case "DISCONNECT":
				this.log("DISCONNECT (from cube)");
				this.disconnect();
				break;
			case "GYRO":
				if (!this.gyroLogged) {
					this.log(`GYRO (first) q=(${evt.quaternion.x.toFixed(2)}, ${evt.quaternion.y.toFixed(2)}, ${evt.quaternion.z.toFixed(2)}, ${evt.quaternion.w.toFixed(2)}) — subsequent GYRO suppressed`);
					this.gyroLogged = true;
				}
				break;
		}
	}
};
var bluetoothStore = new BluetoothStore();
//#endregion
//#region src/lib/format.ts
/** Format raw milliseconds as a cubing-style time string: SS.cc under a
*  minute, M:SS.cc above. Centisecond precision throughout. */
function formatMs(ms) {
	const totalSec = ms / 1e3;
	if (totalSec < 60) return totalSec.toFixed(2);
	const m = Math.floor(totalSec / 60);
	return `${m}:${(totalSec - m * 60).toFixed(2).padStart(5, "0")}`;
}
/** Format the result of an averageOfN / bestSingleMs call. */
function formatAverage(v) {
	if (v === null) return "—";
	if (v === "DNF") return "DNF";
	return formatMs(v);
}
/** Compact human-friendly date+time, e.g. "May 23, 2:32 PM". Used for showing
*  when sessions began. */
function formatDateTime(ms) {
	return new Date(ms).toLocaleString(void 0, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit"
	});
}
//#endregion
//#region src/lib/SessionStats.svelte
function SessionStats($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let { solves } = $$props;
		const best = derived(() => formatAverage(bestSingleMs(solves)));
		const ao5 = derived(() => formatAverage(averageOfN(solves, 5)));
		const ao12 = derived(() => formatAverage(averageOfN(solves, 12)));
		$$renderer.push(`<dl class="session-stats svelte-1p9i49o"><div class="stat svelte-1p9i49o"><dt class="svelte-1p9i49o">best</dt> <dd class="svelte-1p9i49o">${escape_html(best())}</dd></div> <div class="stat svelte-1p9i49o"><dt class="svelte-1p9i49o">ao5</dt> <dd class="svelte-1p9i49o">${escape_html(ao5())}</dd></div> <div class="stat svelte-1p9i49o"><dt class="svelte-1p9i49o">ao12</dt> <dd class="svelte-1p9i49o">${escape_html(ao12())}</dd></div> <div class="stat svelte-1p9i49o"><dt class="svelte-1p9i49o">solves</dt> <dd class="svelte-1p9i49o">${escape_html(solves.length)}</dd></div></dl>`);
	});
}
function newId() {
	return crypto.randomUUID();
}
var TimerStore = class {
	sessions = [];
	solves = [];
	currentSessionId = null;
	constructor() {}
	currentSessionSolves() {
		const id = this.currentSessionId;
		if (!id) return [];
		return this.solves.filter((s) => s.sessionId === id).sort((a, b) => b.startedAt - a.startedAt);
	}
	addSolve(input) {
		const sessionId = this.currentSessionId;
		if (!sessionId) return void 0;
		const solve = {
			id: newId(),
			sessionId,
			startedAt: input.startedAt ?? Date.now(),
			durationMs: input.durationMs,
			scramble: input.scramble,
			penalty: input.penalty,
			...input.moveStream ? { moveStream: input.moveStream } : {}
		};
		this.solves = [...this.solves, solve];
		this.solves;
		return solve;
	}
	setPenalty(id, penalty) {
		this.solves = this.solves.map((s) => s.id === id ? {
			...s,
			penalty
		} : s);
		this.solves;
	}
	deleteSolve(id) {
		this.solves = this.solves.filter((s) => s.id !== id);
		this.solves;
	}
	/** Create a new session named "Session N" where N is one greater than the
	*  highest existing Session-numbered session. Auto-switches to it. */
	createSession() {
		const session = {
			id: newId(),
			name: `Session ${this.nextSessionNumber()}`,
			createdAt: Date.now()
		};
		this.sessions = [...this.sessions, session];
		this.sessions;
		this.setCurrentSession(session.id);
		return session;
	}
	nextSessionNumber() {
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
	setCurrentSession(id) {
		if (!this.sessions.some((s) => s.id === id)) return;
		this.currentSessionId = id;
	}
	/** Delete a session and cascade-delete its solves. Refuses to delete the
	*  last remaining session — there must always be at least one. */
	deleteSession(id) {
		if (this.sessions.length <= 1) return;
		this.sessions = this.sessions.filter((s) => s.id !== id);
		this.solves = this.solves.filter((s) => s.sessionId !== id);
		this.sessions;
		this.solves;
		if (this.currentSessionId === id) {
			const nextId = this.sessions[0]?.id ?? null;
			this.currentSessionId = nextId;
		}
	}
};
var timerStore = new TimerStore();
//#endregion
//#region src/lib/SessionSwitcher.svelte
function SessionSwitcher($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		const sessions = derived(() => timerStore.sessions);
		const currentId = derived(() => timerStore.currentSessionId);
		const current = derived(() => sessions().find((s) => s.id === currentId()));
		const canDelete = derived(() => sessions().length > 1);
		function onSelect(e) {
			const id = e.currentTarget.value;
			timerStore.setCurrentSession(id);
		}
		$$renderer.push(`<div class="session-switcher svelte-xy7xpu">`);
		$$renderer.select({
			onchange: onSelect,
			value: currentId() ?? "",
			class: ""
		}, ($$renderer) => {
			$$renderer.push(`<!--[-->`);
			const each_array = ensure_array_like(sessions());
			for (let $$index = 0, $$length = each_array.length; $$index < $$length; $$index++) {
				let s = each_array[$$index];
				$$renderer.option({ value: s.id }, ($$renderer) => {
					$$renderer.push(`${escape_html(s.name)}`);
				});
			}
			$$renderer.push(`<!--]-->`);
		}, "svelte-xy7xpu");
		$$renderer.push(` `);
		if (current()) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<span class="started svelte-xy7xpu">started ${escape_html(formatDateTime(current().createdAt))}</span>`);
		} else $$renderer.push("<!--[-1-->");
		$$renderer.push(`<!--]--> <span class="spacer svelte-xy7xpu"></span> <button class="icon-btn svelte-xy7xpu" title="New session">+ new</button> <button class="icon-btn danger svelte-xy7xpu"${attr("title", canDelete() ? "Delete this session" : "Can't delete the last session")}${attr("disabled", !canDelete(), true)}>delete</button></div>`);
	});
}
//#endregion
//#region src/lib/SolveList.svelte
function SolveList($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let { solves } = $$props;
		let expandedId = null;
		function displayTime(s) {
			const e = effectiveMs(s);
			if (e === "DNF") return {
				text: "DNF",
				isDnf: true
			};
			const base = formatMs(e);
			return {
				text: s.penalty === "+2" ? `${base}+` : base,
				isDnf: false
			};
		}
		/** BT cube events arrive one quarter turn at a time. For display we
		*  fold same-direction pairs into half turns so the readout matches
		*  cubing notation (`F F → F2`). The stored data stays raw. */
		function displayMoves(text) {
			if (!text) return text;
			return collapseDoubleTurns(text.trim().split(/\s+/)).join(" ");
		}
		function displayMoveStream(stream) {
			return collapseDoubleTurns(stream.map((m) => m.move)).join(" ");
		}
		$$renderer.push(`<section class="solves svelte-15tlzgq">`);
		if (solves.length === 0) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<p class="empty svelte-15tlzgq">No solves yet. Hit space to start.</p>`);
		} else {
			$$renderer.push("<!--[-1-->");
			$$renderer.push(`<table class="svelte-15tlzgq"><thead><tr><th class="col-idx svelte-15tlzgq">#</th><th class="col-time svelte-15tlzgq">time</th><th class="col-scramble svelte-15tlzgq">scramble</th><th class="col-actions svelte-15tlzgq">actions</th></tr></thead><tbody><!--[-->`);
			const each_array = ensure_array_like(solves);
			for (let i = 0, $$length = each_array.length; i < $$length; i++) {
				let solve = each_array[i];
				const t = displayTime(solve);
				const isExpanded = expandedId === solve.id;
				$$renderer.push(`<tr${attr_class("solve-row svelte-15tlzgq", void 0, { "expanded": isExpanded })} role="button" tabindex="0"${attr("aria-expanded", isExpanded)}${attr("aria-label", `Toggle details for solve ${stringify(solves.length - i)}`)}><td class="col-idx svelte-15tlzgq">${escape_html(solves.length - i)}</td><td${attr_class("col-time svelte-15tlzgq", void 0, { "dnf": t.isDnf })}>${escape_html(t.text)}</td><td class="col-scramble svelte-15tlzgq"><code class="svelte-15tlzgq">${escape_html(displayMoves(solve.scramble))}</code></td><td class="col-actions svelte-15tlzgq"><button${attr_class("pen svelte-15tlzgq", void 0, { "active": solve.penalty === "+2" })} title="Toggle +2 penalty">+2</button> <button${attr_class("pen svelte-15tlzgq", void 0, { "active": solve.penalty === "DNF" })} title="Toggle DNF">DNF</button> <button class="pen delete svelte-15tlzgq" title="Delete solve">×</button></td></tr> `);
				if (isExpanded) {
					$$renderer.push("<!--[0-->");
					$$renderer.push(`<tr class="solve-detail svelte-15tlzgq"><td colspan="4" class="svelte-15tlzgq"><div class="detail-grid svelte-15tlzgq"><div class="detail-label svelte-15tlzgq">scramble</div> <div class="detail-value svelte-15tlzgq"><code class="svelte-15tlzgq">${escape_html(displayMoves(solve.scramble))}</code></div> `);
					if (solve.moveStream && solve.moveStream.length > 0) {
						$$renderer.push("<!--[0-->");
						$$renderer.push(`<div class="detail-label svelte-15tlzgq">solve <span class="muted svelte-15tlzgq">(${escape_html(solve.moveStream.length)} moves)</span></div> <div class="detail-value svelte-15tlzgq"><code class="svelte-15tlzgq">${escape_html(displayMoveStream(solve.moveStream))}</code></div>`);
					} else {
						$$renderer.push("<!--[-1-->");
						$$renderer.push(`<div class="detail-label svelte-15tlzgq">solve</div> <div class="detail-value muted svelte-15tlzgq">no move stream recorded (keyboard-only solve)</div>`);
					}
					$$renderer.push(`<!--]--></div></td></tr>`);
				} else $$renderer.push("<!--[-1-->");
				$$renderer.push(`<!--]-->`);
			}
			$$renderer.push(`<!--]--></tbody></table>`);
		}
		$$renderer.push(`<!--]--></section>`);
	});
}
//#endregion
//#region src/lib/Timer.svelte
function Timer($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		/** Current scramble shown above the timer; informational, not used by the
		*  phase machine. */
		/** Called the moment the solve actually starts ticking. Lets the page
		*  reset and start recording per-solve state (e.g. BT move stream). */
		/** Called when a solve concludes (either normally or via inspection DNF). */
		let { scramble, onSolveStart, onSolve } = $$props;
		/** Imperative stop, exposed via `bind:this`. External signals — a BT cube
		*  reaching solved state, for example — can call this to end the active
		*  solve as if the spacebar had been pressed. No-op outside the solving
		*  phase, so it's safe to fire opportunistically. */
		function stop() {
			if (phase === "solving") stopSolve();
		}
		function isSolving() {
			return phase === "solving";
		}
		function isInspecting() {
			return phase === "inspecting" || phase === "holding" || phase === "ready";
		}
		/** External trigger for inspection start. Used when a BT cube finishes
		*  the scramble and the timer should auto-arm. No-op unless we're in a
		*  state where the spacebar would also start inspection (idle or stopped
		*  past the grace window). */
		function startInspection() {
			if (phase === "idle") beginInspection();
			else if (phase === "stopped") {
				if (performance.now() - stoppedAt < POST_STOP_GRACE_MS) return;
				beginInspection();
			}
		}
		/** External trigger to skip the hold-to-arm dance and start solving now.
		*  Used when the first BT move during inspection should kick off the
		*  solve. No-op outside the inspection family of phases. */
		function startSolvingNow() {
			if (phase === "inspecting" || phase === "holding" || phase === "ready") startSolving();
		}
		const INSPECTION_MS = 15e3;
		const INSPECTION_DNF_MS = 17e3;
		const POST_STOP_GRACE_MS = 500;
		let phase = "idle";
		let displayMs = 0;
		let inspectionElapsedMs = 0;
		let lastResult = null;
		let inspectionStartedAt = 0;
		let solvingStartedAt = 0;
		let stoppedAt = 0;
		let rafId = null;
		let dnfTimeoutId = null;
		let holdReadyTimeoutId = null;
		function cancelTimers() {
			if (rafId !== null) {
				cancelAnimationFrame(rafId);
				rafId = null;
			}
			if (dnfTimeoutId !== null) {
				clearTimeout(dnfTimeoutId);
				dnfTimeoutId = null;
			}
			if (holdReadyTimeoutId !== null) {
				clearTimeout(holdReadyTimeoutId);
				holdReadyTimeoutId = null;
			}
		}
		function tickInspection() {
			inspectionElapsedMs = performance.now() - inspectionStartedAt;
			rafId = requestAnimationFrame(tickInspection);
		}
		function tickSolving() {
			displayMs = performance.now() - solvingStartedAt;
			rafId = requestAnimationFrame(tickSolving);
		}
		function beginInspection() {
			cancelTimers();
			lastResult = null;
			inspectionStartedAt = performance.now();
			inspectionElapsedMs = 0;
			phase = "inspecting";
			tickInspection();
			dnfTimeoutId = setTimeout(() => {
				if (phase === "inspecting" || phase === "holding" || phase === "ready") finishWith({
					durationMs: 0,
					penalty: "DNF"
				});
			}, INSPECTION_DNF_MS);
		}
		function startSolving() {
			if (holdReadyTimeoutId !== null) {
				clearTimeout(holdReadyTimeoutId);
				holdReadyTimeoutId = null;
			}
			if (dnfTimeoutId !== null) {
				clearTimeout(dnfTimeoutId);
				dnfTimeoutId = null;
			}
			solvingStartedAt = performance.now();
			displayMs = 0;
			phase = "solving";
			onSolveStart?.();
			tickSolving();
		}
		function stopSolve() {
			const durationMs = performance.now() - solvingStartedAt;
			const inspMs = solvingStartedAt - inspectionStartedAt;
			let penalty = "none";
			if (inspMs > INSPECTION_DNF_MS) penalty = "DNF";
			else if (inspMs > INSPECTION_MS) penalty = "+2";
			finishWith({
				durationMs,
				penalty
			});
		}
		function finishWith(result) {
			cancelTimers();
			lastResult = result;
			displayMs = result.durationMs;
			phase = "stopped";
			stoppedAt = performance.now();
			onSolve(result);
		}
		function inspectionDisplay(elapsedMs) {
			if (elapsedMs >= INSPECTION_DNF_MS) return "DNF";
			if (elapsedMs >= INSPECTION_MS) return "+2";
			return Math.ceil((INSPECTION_MS - elapsedMs) / 1e3).toString();
		}
		const bigText = derived(() => {
			switch (phase) {
				case "idle": return scramble ? "ready" : "—";
				case "inspecting": return inspectionDisplay(inspectionElapsedMs);
				case "holding": return inspectionDisplay(inspectionElapsedMs);
				case "ready": return "GO";
				case "solving": return formatMs(displayMs);
				case "stopped": {
					if (!lastResult) return formatMs(displayMs);
					if (lastResult.penalty === "DNF") return "DNF";
					const base = formatMs(lastResult.durationMs);
					return lastResult.penalty === "+2" ? `${base} (+2)` : base;
				}
			}
		});
		const inspectionWarning = derived(() => {
			if (phase !== "inspecting" && phase !== "holding") return "ok";
			if (inspectionElapsedMs >= INSPECTION_MS) return "dnf";
			if (inspectionElapsedMs >= 12e3) return "danger";
			if (inspectionElapsedMs >= 8e3) return "warn";
			return "ok";
		});
		const hint = derived(() => {
			switch (phase) {
				case "idle": return scramble ? "press space to start inspection" : "loading scramble…";
				case "inspecting": return "press space when ready to solve";
				case "holding": return "keep holding…";
				case "ready": return "release space to start";
				case "solving": return "press space to stop";
				case "stopped": return "press space for next solve";
			}
		});
		$$renderer.push(`<div class="timer-shell svelte-1tqczcw"${attr("data-phase", phase)}${attr("data-warning", inspectionWarning())}><div class="timer-display svelte-1tqczcw">${escape_html(bigText())}</div> <div class="timer-hint svelte-1tqczcw">${escape_html(hint())}</div></div>`);
		bind_props($$props, {
			stop,
			isSolving,
			isInspecting,
			startInspection,
			startSolvingNow
		});
	});
}
//#endregion
//#region src/routes/timer/+page.svelte
function _page($$renderer, $$props) {
	$$renderer.component(($$renderer) => {
		let currentScramble = null;
		let nextScramble = null;
		/** Live scramble tracker — non-null only when BT is connected and we have
		*  a scramble loaded. Each cube move during the scrambling phase
		*  advances it (or triggers a regen on a wrong move). */
		let trackerState = null;
		/** Set after a wrong move while we wait to see whether the user undoes it
		*  (inverse of `wrongMove`) or commits to the regenerated scramble. Holds
		*  the snapshot needed to revert. */
		let pendingUndo = null;
		/** Per-solve buffers. */
		let recordedMoves = [];
		let appliedMoves = [];
		function freshTrackerForCurrent() {
			if (bluetoothStore.status === "connected" && currentScramble) trackerState = newTrackerState(currentScramble);
		}
		function advanceScramble() {
			currentScramble = nextScramble;
			nextScramble = null;
			appliedMoves = [];
			pendingUndo = null;
			freshTrackerForCurrent();
			next3x3Scramble().then((s) => {
				nextScramble = s;
			});
		}
		/** Inverse of a single 90°/180° move. `R` ↔ `R'`, `R2` is its own inverse. */
		function inverseMove(move) {
			if (move.endsWith("'")) return move.slice(0, -1);
			if (move.endsWith("2")) return move;
			return move + "'";
		}
		function handleSolveStart() {
			recordedMoves = [];
			performance.now();
		}
		function handleSolve(result) {
			if (!currentScramble) return;
			const scramble = appliedMoves.length > 0 ? appliedMoves.join(" ") : currentScramble;
			timerStore.addSolve({
				scramble,
				durationMs: result.durationMs,
				penalty: result.penalty,
				moveStream: recordedMoves.length > 0 ? [...recordedMoves] : void 0
			});
			recordedMoves = [];
			advanceScramble();
		}
		const sessionSolves = derived(() => timerStore.currentSessionSolves());
		function moveLabel(step) {
			return step.face + (step.quantity === -1 ? "'" : step.quantity === 2 ? "2" : "");
		}
		head("u5z8t2", $$renderer, ($$renderer) => {
			$$renderer.title(($$renderer) => {
				$$renderer.push(`<title>Timer — cubing</title>`);
			});
		});
		$$renderer.push(`<section class="timer-page svelte-u5z8t2"><p class="scramble svelte-u5z8t2" aria-live="polite">`);
		if (currentScramble && trackerState) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<!--[-->`);
			const each_array = ensure_array_like(trackerState.steps);
			for (let i = 0, $$length = each_array.length; i < $$length; i++) {
				let step = each_array[i];
				const isDone = i < trackerState.currentIndex;
				const isCurrent = i === trackerState.currentIndex;
				const isHalf = isCurrent && trackerState.subProgress === 1;
				$$renderer.push(`<span${attr_class("scramble-token svelte-u5z8t2", void 0, {
					"done": isDone,
					"current": isCurrent,
					"half": isHalf
				})}>${escape_html(moveLabel(step))}</span> `);
			}
			$$renderer.push(`<!--]-->`);
		} else {
			$$renderer.push("<!--[-1-->");
			$$renderer.push(`${escape_html(currentScramble ?? "Loading scramble…")}`);
		}
		$$renderer.push(`<!--]--></p> `);
		if (pendingUndo) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<p class="scramble-undo-hint svelte-u5z8t2" aria-live="polite">wrong move — do <code class="svelte-u5z8t2">${escape_html(inverseMove(pendingUndo.wrongMove))}</code> to undo, or any other move to commit to a new scramble</p>`);
		} else $$renderer.push("<!--[-1-->");
		$$renderer.push(`<!--]--> `);
		Timer($$renderer, {
			scramble: currentScramble,
			onSolveStart: handleSolveStart,
			onSolve: handleSolve
		});
		$$renderer.push(`<!----> <div class="bt-bar svelte-u5z8t2">`);
		if (!bluetoothStore.isAvailable()) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<span class="bt-note svelte-u5z8t2">Web Bluetooth isn't supported here — try Chrome, Edge, or Brave.</span>`);
		} else if (bluetoothStore.status === "connected") {
			$$renderer.push("<!--[1-->");
			$$renderer.push(`<span class="bt-status svelte-u5z8t2"><span class="bt-dot bt-dot-on svelte-u5z8t2"></span> ${escape_html(bluetoothStore.deviceName ?? "cube")} `);
			if (bluetoothStore.batteryPct !== null) {
				$$renderer.push("<!--[0-->");
				$$renderer.push(`· <span class="bt-batt svelte-u5z8t2">${escape_html(bluetoothStore.batteryPct)}%</span>`);
			} else $$renderer.push("<!--[-1-->");
			$$renderer.push(`<!--]--></span> <button class="bt-btn svelte-u5z8t2" title="Tell the cube its current physical state is solved. Use when the cube's tracked state has drifted from reality.">cube is solved</button> <button class="bt-btn svelte-u5z8t2">disconnect</button>`);
		} else if (bluetoothStore.status === "connecting") {
			$$renderer.push("<!--[2-->");
			$$renderer.push(`<span class="bt-status svelte-u5z8t2"><span class="bt-dot bt-dot-pending svelte-u5z8t2"></span> connecting…</span>`);
		} else {
			$$renderer.push("<!--[-1-->");
			$$renderer.push(`<button class="bt-btn svelte-u5z8t2">connect cube</button> <button class="bt-btn-link svelte-u5z8t2" title="Clear cached cube MAC addresses (use if a wrong MAC was entered)">forget MAC</button> `);
			if (bluetoothStore.errorMessage) {
				$$renderer.push("<!--[0-->");
				$$renderer.push(`<span class="bt-error svelte-u5z8t2">${escape_html(bluetoothStore.errorMessage)}</span>`);
			} else $$renderer.push("<!--[-1-->");
			$$renderer.push(`<!--]-->`);
		}
		$$renderer.push(`<!--]--> `);
		if (bluetoothStore.status === "connected" && bluetoothStore.recentMoves.length > 0) {
			$$renderer.push("<!--[0-->");
			$$renderer.push(`<code class="bt-ticker svelte-u5z8t2">${escape_html(collapseDoubleTurns(bluetoothStore.recentMoves).join(" "))}</code>`);
		} else $$renderer.push("<!--[-1-->");
		$$renderer.push(`<!--]--></div> <div class="session-bar svelte-u5z8t2">`);
		SessionSwitcher($$renderer, {});
		$$renderer.push(`<!----> `);
		SessionStats($$renderer, { solves: sessionSolves() });
		$$renderer.push(`<!----></div> `);
		SolveList($$renderer, { solves: sessionSolves() });
		$$renderer.push(`<!----> <section class="bt-debug svelte-u5z8t2"><div class="bt-debug-head svelte-u5z8t2"><h3 class="svelte-u5z8t2">BT debug log</h3> <span class="bt-debug-meta svelte-u5z8t2">${escape_html(bluetoothStore.debugLog.length)} entries · GYRO suppressed</span> <span class="bt-debug-spacer svelte-u5z8t2"></span> <button class="bt-btn-link svelte-u5z8t2">clear</button></div> <pre class="bt-debug-log svelte-u5z8t2">${escape_html(bluetoothStore.debugLog.join("\n") || "(no events yet)")}</pre></section></section>`);
	});
}
//#endregion
export { _page as default };
