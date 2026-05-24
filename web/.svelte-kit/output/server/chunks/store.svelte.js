import "./dev.js";
function readInitial() {
	return {
		state: {},
		pref: {}
	};
}
var CubingState = class {
	state = {};
	pref = {};
	constructor() {
		const initial = readInitial();
		this.state = initial.state ?? {};
		this.pref = initial.pref ?? {};
	}
	persist() {}
	/** Cycle: unlearned → learning → learned → unlearned. Returns the new code. */
	cycleState(caseId) {
		const next = ((this.state[caseId] ?? 0) + 1) % 3;
		if (next === 0) delete this.state[caseId];
		else this.state[caseId] = next;
		this.persist();
		return next;
	}
	/** Set the preferred-alg index for a case; toggling the same one clears it. */
	togglePref(caseId, algIndex) {
		if (this.pref[caseId] === algIndex) delete this.pref[caseId];
		else this.pref[caseId] = algIndex;
		this.persist();
		return this.pref[caseId];
	}
	/** Count of cases marked `learned` (state === 2) within the given roster. */
	learnedCount(caseIds) {
		let n = 0;
		for (const id of caseIds) if (this.state[id] === 2) n++;
		return n;
	}
};
var cubingState = new CubingState();
//#endregion
export { cubingState as t };
