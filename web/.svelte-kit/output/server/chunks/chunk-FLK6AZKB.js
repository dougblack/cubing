import { c as QuantumMove, d as functionFromTraversal, i as Conjugate, l as TraversalDownUp, o as Move, r as Commutator, s as Pause, t as Alg } from "./chunk-O6HEZXGY.js";
//#region ../core/node_modules/cubing/dist/lib/cubing/chunks/chunk-RINY3U6G.js
function combineTransformationData(definition, transformationData1, transformationData2) {
	const newTransformationData = {};
	for (const orbitDefinition of definition.orbits) {
		const orbit1 = transformationData1[orbitDefinition.orbitName];
		const orbit2 = transformationData2[orbitDefinition.orbitName];
		if (isOrbitTransformationDataIdentityUncached(orbitDefinition.numOrientations, orbit2)) newTransformationData[orbitDefinition.orbitName] = orbit1;
		else if (isOrbitTransformationDataIdentityUncached(orbitDefinition.numOrientations, orbit1)) newTransformationData[orbitDefinition.orbitName] = orbit2;
		else {
			const newPerm = new Array(orbitDefinition.numPieces);
			if (orbitDefinition.numOrientations === 1) {
				for (let idx = 0; idx < orbitDefinition.numPieces; idx++) newPerm[idx] = orbit1.permutation[orbit2.permutation[idx]];
				newTransformationData[orbitDefinition.orbitName] = {
					permutation: newPerm,
					orientationDelta: orbit1.orientationDelta
				};
			} else {
				const newOri = new Array(orbitDefinition.numPieces);
				for (let idx = 0; idx < orbitDefinition.numPieces; idx++) {
					newOri[idx] = (orbit1.orientationDelta[orbit2.permutation[idx]] + orbit2.orientationDelta[idx]) % orbitDefinition.numOrientations;
					newPerm[idx] = orbit1.permutation[orbit2.permutation[idx]];
				}
				newTransformationData[orbitDefinition.orbitName] = {
					permutation: newPerm,
					orientationDelta: newOri
				};
			}
		}
	}
	return newTransformationData;
}
function applyTransformationDataToKPatternData(definition, patternData, transformationData) {
	const newPatternData = {};
	for (const orbitDefinition of definition.orbits) {
		const patternOrbit = patternData[orbitDefinition.orbitName];
		const transformationOrbit = transformationData[orbitDefinition.orbitName];
		if (isOrbitTransformationDataIdentityUncached(orbitDefinition.numOrientations, transformationOrbit)) newPatternData[orbitDefinition.orbitName] = patternOrbit;
		else {
			const newPieces = new Array(orbitDefinition.numPieces);
			if (orbitDefinition.numOrientations === 1) {
				for (let idx = 0; idx < orbitDefinition.numPieces; idx++) newPieces[idx] = patternOrbit.pieces[transformationOrbit.permutation[idx]];
				const newOrbitData = {
					pieces: newPieces,
					orientation: patternOrbit.orientation
				};
				newPatternData[orbitDefinition.orbitName] = newOrbitData;
			} else {
				const newOrientation = new Array(orbitDefinition.numPieces);
				const newOrientationMod = patternOrbit.orientationMod ? new Array(orbitDefinition.numPieces) : void 0;
				for (let idx = 0; idx < orbitDefinition.numPieces; idx++) {
					const transformationIdx = transformationOrbit.permutation[idx];
					let mod = orbitDefinition.numOrientations;
					if (patternOrbit.orientationMod) {
						const orientationMod = patternOrbit.orientationMod[transformationIdx];
						newOrientationMod[idx] = orientationMod;
						mod = orientationMod || orbitDefinition.numOrientations;
					}
					newOrientation[idx] = (patternOrbit.orientation[transformationIdx] + transformationOrbit.orientationDelta[idx]) % mod;
					newPieces[idx] = patternOrbit.pieces[transformationIdx];
				}
				const newOrbitData = {
					pieces: newPieces,
					orientation: newOrientation
				};
				if (newOrientationMod) newOrbitData.orientationMod = newOrientationMod;
				newPatternData[orbitDefinition.orbitName] = newOrbitData;
			}
		}
	}
	return newPatternData;
}
var FREEZE = false;
var identityOrbitCache = /* @__PURE__ */ new Map();
function constructIdentityOrbitTransformation(numPieces) {
	const cached = identityOrbitCache.get(numPieces);
	if (cached) return cached;
	const newPermutation = new Array(numPieces);
	const newOrientation = new Array(numPieces);
	for (let i = 0; i < numPieces; i++) {
		newPermutation[i] = i;
		newOrientation[i] = 0;
	}
	const orbitTransformation = {
		permutation: newPermutation,
		orientationDelta: newOrientation
	};
	if (FREEZE) {
		Object.freeze(newPermutation);
		Object.freeze(newOrientation);
		Object.freeze(orbitTransformation);
	}
	identityOrbitCache.set(numPieces, orbitTransformation);
	return orbitTransformation;
}
function constructIdentityTransformationDataUncached(definition) {
	const transformation = {};
	for (const orbitDefinition of definition.orbits) transformation[orbitDefinition.orbitName] = constructIdentityOrbitTransformation(orbitDefinition.numPieces);
	if (FREEZE) Object.freeze(transformation);
	return transformation;
}
function moveToTransformationUncached(kpuzzle, move) {
	function getTransformationData(key, multiplyAmount) {
		const s = key.toString();
		const movesDef = kpuzzle.definition.moves[s];
		if (movesDef) return repeatTransformationUncached(kpuzzle, movesDef, multiplyAmount);
		const derivedDef = kpuzzle.definition.derivedMoves?.[s];
		if (derivedDef) return repeatTransformationUncached(kpuzzle, kpuzzle.algToTransformation(derivedDef).transformationData, multiplyAmount);
	}
	const data = getTransformationData(move.quantum, move.amount) ?? getTransformationData(move, 1) ?? getTransformationData(move.invert, -1);
	if (data) return data;
	throw new Error(`Invalid move for KPuzzle (${kpuzzle.name()}): ${move}`);
}
var KTransformation = class _KTransformation {
	constructor(kpuzzle, transformationData) {
		this.kpuzzle = kpuzzle;
		this.transformationData = transformationData;
	}
	toJSON() {
		return {
			experimentalPuzzleName: this.kpuzzle.name(),
			transformationData: this.transformationData
		};
	}
	invert() {
		return new _KTransformation(this.kpuzzle, invertTransformation(this.kpuzzle, this.transformationData));
	}
	#cachedIsIdentity;
	isIdentityTransformation() {
		return this.#cachedIsIdentity ??= this.isIdentical(this.kpuzzle.identityTransformation());
	}
	/** @deprecated */
	static experimentalConstructIdentity(kpuzzle) {
		const transformation = new _KTransformation(kpuzzle, constructIdentityTransformationDataUncached(kpuzzle.definition));
		transformation.#cachedIsIdentity = true;
		return transformation;
	}
	isIdentical(t2) {
		return isTransformationDataIdentical(this.kpuzzle, this.transformationData, t2.transformationData);
	}
	/** @deprecated */
	apply(source) {
		return this.applyTransformation(this.kpuzzle.toTransformation(source));
	}
	applyTransformation(t2) {
		if (this.kpuzzle !== t2.kpuzzle) throw new Error(`Tried to apply a transformation for a KPuzzle (${t2.kpuzzle.name()}) to a different KPuzzle (${this.kpuzzle.name()}).`);
		if (this.#cachedIsIdentity) return new _KTransformation(this.kpuzzle, t2.transformationData);
		if (t2.#cachedIsIdentity) return new _KTransformation(this.kpuzzle, this.transformationData);
		return new _KTransformation(this.kpuzzle, combineTransformationData(this.kpuzzle.definition, this.transformationData, t2.transformationData));
	}
	applyMove(move) {
		return this.applyTransformation(this.kpuzzle.moveToTransformation(move));
	}
	applyAlg(alg) {
		return this.applyTransformation(this.kpuzzle.algToTransformation(alg));
	}
	toKPattern() {
		return KPattern.fromTransformation(this);
	}
	repetitionOrder() {
		return transformationRepetitionOrder(this.kpuzzle.definition, this);
	}
	selfMultiply(amount) {
		return new _KTransformation(this.kpuzzle, repeatTransformationUncached(this.kpuzzle, this.transformationData, amount));
	}
};
function isOrbitTransformationDataIdentityUncached(numOrientations, orbitTransformationData) {
	if (!orbitTransformationData.permutation) console.log(orbitTransformationData);
	const { permutation } = orbitTransformationData;
	const numPieces = permutation.length;
	for (let idx = 0; idx < numPieces; idx++) if (permutation[idx] !== idx) return false;
	if (numOrientations > 1) {
		const { orientationDelta: orientation } = orbitTransformationData;
		for (let idx = 0; idx < numPieces; idx++) if (orientation[idx] !== 0) return false;
	}
	return true;
}
function isOrbitTransformationDataIdentical(orbitDefinition, orbitTransformationData1, orbitTransformationData2, options = {}) {
	for (let idx = 0; idx < orbitDefinition.numPieces; idx++) {
		if (!options?.ignorePieceOrientations && orbitTransformationData1.orientationDelta[idx] !== orbitTransformationData2.orientationDelta[idx]) return false;
		if (!options?.ignorePiecePermutation && orbitTransformationData1.permutation[idx] !== orbitTransformationData2.permutation[idx]) return false;
	}
	return true;
}
function isTransformationDataIdentical(kpuzzle, transformationData1, transformationData2) {
	for (const orbitDefinition of kpuzzle.definition.orbits) if (!isOrbitTransformationDataIdentical(orbitDefinition, transformationData1[orbitDefinition.orbitName], transformationData2[orbitDefinition.orbitName])) return false;
	return true;
}
function isOrbitPatternDataIdentical(orbitDefinition, orbitPatternData1, orbitPatternData2, options = {}) {
	for (let idx = 0; idx < orbitDefinition.numPieces; idx++) {
		if (!options?.ignorePieceOrientations && (orbitPatternData1.orientation[idx] !== orbitPatternData2.orientation[idx] || (orbitPatternData1.orientationMod?.[idx] ?? 0) !== (orbitPatternData2.orientationMod?.[idx] ?? 0))) return false;
		if (!options?.ignorePieceIndices && orbitPatternData1.pieces[idx] !== orbitPatternData2.pieces[idx]) return false;
	}
	return true;
}
function isPatternDataIdentical(kpuzzle, patternData1, patternData2) {
	for (const orbitDefinition of kpuzzle.definition.orbits) if (!isOrbitPatternDataIdentical(orbitDefinition, patternData1[orbitDefinition.orbitName], patternData2[orbitDefinition.orbitName])) return false;
	return true;
}
function invertTransformation(kpuzzle, transformationData) {
	const newTransformationData = {};
	for (const orbitDefinition of kpuzzle.definition.orbits) {
		const orbitTransformationData = transformationData[orbitDefinition.orbitName];
		if (isOrbitTransformationDataIdentityUncached(orbitDefinition.numOrientations, orbitTransformationData)) newTransformationData[orbitDefinition.orbitName] = orbitTransformationData;
		else if (orbitDefinition.numOrientations === 1) {
			const newPerm = new Array(orbitDefinition.numPieces);
			for (let idx = 0; idx < orbitDefinition.numPieces; idx++) newPerm[orbitTransformationData.permutation[idx]] = idx;
			newTransformationData[orbitDefinition.orbitName] = {
				permutation: newPerm,
				orientationDelta: orbitTransformationData.orientationDelta
			};
		} else {
			const newPerm = new Array(orbitDefinition.numPieces);
			const newOri = new Array(orbitDefinition.numPieces);
			for (let idx = 0; idx < orbitDefinition.numPieces; idx++) {
				const fromIdx = orbitTransformationData.permutation[idx];
				newPerm[fromIdx] = idx;
				newOri[fromIdx] = (orbitDefinition.numOrientations - orbitTransformationData.orientationDelta[idx] + orbitDefinition.numOrientations) % orbitDefinition.numOrientations;
			}
			newTransformationData[orbitDefinition.orbitName] = {
				permutation: newPerm,
				orientationDelta: newOri
			};
		}
	}
	return newTransformationData;
}
function repeatTransformationUncached(kpuzzle, transformationData, amount) {
	if (amount === 1) return transformationData;
	if (amount < 0) return repeatTransformationUncached(kpuzzle, invertTransformation(kpuzzle, transformationData), -amount);
	if (amount === 0) {
		const { transformationData: transformationData2 } = kpuzzle.identityTransformation();
		return transformationData2;
	}
	let halfish = transformationData;
	if (amount !== 2) halfish = repeatTransformationUncached(kpuzzle, transformationData, Math.floor(amount / 2));
	const twiceHalfish = combineTransformationData(kpuzzle.definition, halfish, halfish);
	if (amount % 2 === 0) return twiceHalfish;
	else return combineTransformationData(kpuzzle.definition, transformationData, twiceHalfish);
}
var AlgToTransformationTraversal = class extends TraversalDownUp {
	traverseAlg(alg, kpuzzle) {
		let transformation = null;
		for (const algNode of alg.childAlgNodes()) if (transformation) transformation = transformation.applyTransformation(this.traverseAlgNode(algNode, kpuzzle));
		else transformation = this.traverseAlgNode(algNode, kpuzzle);
		return transformation ?? kpuzzle.identityTransformation();
	}
	traverseGrouping(grouping, kpuzzle) {
		return new KTransformation(kpuzzle, repeatTransformationUncached(kpuzzle, this.traverseAlg(grouping.alg, kpuzzle).transformationData, grouping.amount));
	}
	traverseMove(move, kpuzzle) {
		return kpuzzle.moveToTransformation(move);
	}
	traverseCommutator(commutator, kpuzzle) {
		const aTransformation = this.traverseAlg(commutator.A, kpuzzle);
		const bTransformation = this.traverseAlg(commutator.B, kpuzzle);
		return aTransformation.applyTransformation(bTransformation).applyTransformation(aTransformation.invert()).applyTransformation(bTransformation.invert());
	}
	traverseConjugate(conjugate, kpuzzle) {
		const aTransformation = this.traverseAlg(conjugate.A, kpuzzle);
		const bTransformation = this.traverseAlg(conjugate.B, kpuzzle);
		return aTransformation.applyTransformation(bTransformation).applyTransformation(aTransformation.invert());
	}
	traversePause(_, kpuzzle) {
		return kpuzzle.identityTransformation();
	}
	traverseNewline(_, kpuzzle) {
		return kpuzzle.identityTransformation();
	}
	traverseLineComment(_, kpuzzle) {
		return kpuzzle.identityTransformation();
	}
};
var algToTransformation = functionFromTraversal(AlgToTransformationTraversal);
function gcd(a, b) {
	if (b) return gcd(b, a % b);
	return a;
}
function transformationRepetitionOrder(definition, transformation) {
	let order = 1;
	for (const orbitDefinition of definition.orbits) {
		const transformationOrbit = transformation.transformationData[orbitDefinition.orbitName];
		const orbitPieces = new Array(orbitDefinition.numPieces);
		for (let startIdx = 0; startIdx < orbitDefinition.numPieces; startIdx++) if (!orbitPieces[startIdx]) {
			let currentIdx = startIdx;
			let orientationSum = 0;
			let cycleLength = 0;
			for (;;) {
				orbitPieces[currentIdx] = true;
				orientationSum = orientationSum + transformationOrbit.orientationDelta[currentIdx];
				cycleLength = cycleLength + 1;
				currentIdx = transformationOrbit.permutation[currentIdx];
				if (currentIdx === startIdx) break;
			}
			if (orientationSum !== 0) cycleLength = cycleLength * orbitDefinition.numOrientations / gcd(orbitDefinition.numOrientations, Math.abs(orientationSum));
			order = order * cycleLength / gcd(order, cycleLength);
		}
	}
	return order;
}
var KPattern = class _KPattern {
	constructor(kpuzzle, patternData) {
		this.kpuzzle = kpuzzle;
		this.patternData = patternData;
	}
	toJSON() {
		return {
			experimentalPuzzleName: this.kpuzzle.name(),
			patternData: this.patternData
		};
	}
	static fromTransformation(transformation) {
		const newPatternData = applyTransformationDataToKPatternData(transformation.kpuzzle.definition, transformation.kpuzzle.definition.defaultPattern, transformation.transformationData);
		return new _KPattern(transformation.kpuzzle, newPatternData);
	}
	/** @deprecated */
	apply(source) {
		return this.applyTransformation(this.kpuzzle.toTransformation(source));
	}
	applyTransformation(transformation) {
		if (transformation.isIdentityTransformation()) return new _KPattern(this.kpuzzle, this.patternData);
		const newPatternData = applyTransformationDataToKPatternData(this.kpuzzle.definition, this.patternData, transformation.transformationData);
		return new _KPattern(this.kpuzzle, newPatternData);
	}
	applyMove(move) {
		return this.applyTransformation(this.kpuzzle.moveToTransformation(move));
	}
	applyAlg(alg) {
		return this.applyTransformation(this.kpuzzle.algToTransformation(alg));
	}
	isIdentical(other) {
		return isPatternDataIdentical(this.kpuzzle, this.patternData, other.patternData);
	}
	/** @deprecated */
	experimentalToTransformation() {
		if (!this.kpuzzle.canConvertDefaultPatternToUniqueTransformation()) return null;
		const transformationData = {};
		for (const [orbitName, patternOrbitData] of Object.entries(this.patternData)) transformationData[orbitName] = {
			permutation: patternOrbitData.pieces,
			orientationDelta: patternOrbitData.orientation
		};
		return new KTransformation(this.kpuzzle, transformationData);
	}
	experimentalIsSolved(options) {
		if (!this.kpuzzle.definition.experimentalIsPatternSolved) throw new Error("`KPattern.experimentalIsPatternSolved()` is not supported for this puzzle at the moment.");
		return this.kpuzzle.definition.experimentalIsPatternSolved(this, options);
	}
};
var KPuzzle = class {
	constructor(definition, options) {
		this.definition = definition;
		this.experimentalPGNotation = options?.experimentalPGNotation;
	}
	experimentalPGNotation;
	#indexedOrbits;
	lookupOrbitDefinition(orbitName) {
		this.#indexedOrbits ||= (() => {
			const indexedOrbits = {};
			for (const orbitDefinition of this.definition.orbits) indexedOrbits[orbitDefinition.orbitName] = orbitDefinition;
			return indexedOrbits;
		})();
		return this.#indexedOrbits[orbitName];
	}
	name() {
		return this.definition.name;
	}
	identityTransformation() {
		return KTransformation.experimentalConstructIdentity(this);
	}
	#moveToTransformationDataCache = /* @__PURE__ */ new Map();
	moveToTransformation(move) {
		if (typeof move === "string") move = new Move(move);
		const cacheKey = move.toString();
		const cachedTransformationData = this.#moveToTransformationDataCache.get(cacheKey);
		if (cachedTransformationData) return new KTransformation(this, cachedTransformationData);
		if (this.experimentalPGNotation) {
			const transformationData2 = this.experimentalPGNotation.lookupMove(move);
			if (!transformationData2) throw new Error(`could not map to internal move: ${move}`);
			this.#moveToTransformationDataCache.set(cacheKey, transformationData2);
			return new KTransformation(this, transformationData2);
		}
		const transformationData = moveToTransformationUncached(this, move);
		this.#moveToTransformationDataCache.set(cacheKey, transformationData);
		return new KTransformation(this, transformationData);
	}
	algToTransformation(alg) {
		if (typeof alg === "string") alg = new Alg(alg);
		return algToTransformation(alg, this);
	}
	/** @deprecated */
	toTransformation(source) {
		if (typeof source === "string") return this.algToTransformation(source);
		else if (source?.is?.(Alg)) return this.algToTransformation(source);
		else if (source?.is?.(Move)) return this.moveToTransformation(source);
		else return source;
	}
	defaultPattern() {
		return new KPattern(this, this.definition.defaultPattern);
	}
	#cachedCanConvertDefaultPatternToUniqueTransformation;
	canConvertDefaultPatternToUniqueTransformation() {
		return this.#cachedCanConvertDefaultPatternToUniqueTransformation ??= (() => {
			for (const orbitDefinition of this.definition.orbits) {
				const pieces = new Array(orbitDefinition.numPieces).fill(false);
				for (const piece of this.definition.defaultPattern[orbitDefinition.orbitName].pieces) pieces[piece] = true;
				for (const piece of pieces) if (!piece) return false;
			}
			return true;
		})();
	}
};
//#endregion
//#region ../core/node_modules/cubing/dist/lib/cubing/chunks/chunk-FUHYAW74.js
var PLazy = class _PLazy extends Promise {
	constructor(executor) {
		super((resolve) => {
			resolve();
		});
		this._executor = executor;
	}
	static from(function_) {
		return new _PLazy((resolve) => {
			resolve(function_());
		});
	}
	static resolve(value) {
		return new _PLazy((resolve) => {
			resolve(value);
		});
	}
	static reject(error) {
		return new _PLazy((_resolve, reject) => {
			reject(error);
		});
	}
	then(onFulfilled, onRejected) {
		this._promise = this._promise || new Promise(this._executor);
		return this._promise.then(onFulfilled, onRejected);
	}
	catch(onRejected) {
		this._promise = this._promise || new Promise(this._executor);
		return this._promise.catch(onRejected);
	}
};
function from(function_) {
	return new PLazy((resolve) => {
		resolve(function_());
	});
}
var PieceAnnotation = class {
	stickerings = /* @__PURE__ */ new Map();
	constructor(kpuzzle, defaultValue) {
		for (const orbitDefinition of kpuzzle.definition.orbits) this.stickerings.set(orbitDefinition.orbitName, new Array(orbitDefinition.numPieces).fill(defaultValue));
	}
};
var regular = "regular";
var ignored = "ignored";
var oriented = "oriented";
var experimentalOriented2 = "experimentalOriented2";
var invisible = "invisible";
var dim = "dim";
var mystery = "mystery";
var pieceStickerings = {
	["Regular"]: { facelets: [
		regular,
		regular,
		regular,
		regular,
		regular
	] },
	["Ignored"]: { facelets: [
		ignored,
		ignored,
		ignored,
		ignored,
		ignored
	] },
	["OrientationStickers"]: { facelets: [
		oriented,
		oriented,
		oriented,
		oriented,
		oriented
	] },
	["IgnoreNonPrimary"]: { facelets: [
		regular,
		ignored,
		ignored,
		ignored,
		ignored
	] },
	["Invisible"]: { facelets: [
		invisible,
		invisible,
		invisible,
		invisible,
		invisible
	] },
	["PermuteNonPrimary"]: { facelets: [
		dim,
		regular,
		regular,
		regular,
		regular
	] },
	["Dim"]: { facelets: [
		dim,
		dim,
		dim,
		dim,
		dim
	] },
	["Ignoriented"]: { facelets: [
		dim,
		ignored,
		ignored,
		ignored,
		ignored
	] },
	["OrientationWithoutPermutation"]: { facelets: [
		oriented,
		ignored,
		ignored,
		ignored,
		ignored
	] },
	["ExperimentalOrientationWithoutPermutation2"]: { facelets: [
		experimentalOriented2,
		ignored,
		ignored,
		ignored,
		ignored
	] },
	["Mystery"]: { facelets: [
		mystery,
		mystery,
		mystery,
		mystery,
		mystery
	] }
};
function getPieceStickeringMask(pieceStickering) {
	return pieceStickerings[pieceStickering];
}
var PuzzleStickering = class extends PieceAnnotation {
	constructor(kpuzzle) {
		super(kpuzzle, "Regular");
	}
	set(pieceSet, pieceStickering) {
		for (const [orbitName, pieces] of this.stickerings.entries()) for (let i = 0; i < pieces.length; i++) if (pieceSet.stickerings.get(orbitName)[i]) pieces[i] = pieceStickering;
		return this;
	}
	toStickeringMask() {
		const stickeringMask = { orbits: {} };
		for (const [orbitName, pieceStickerings2] of this.stickerings.entries()) {
			const pieces = [];
			const orbitStickeringMask = { pieces };
			stickeringMask.orbits[orbitName] = orbitStickeringMask;
			for (const pieceStickering of pieceStickerings2) pieces.push(getPieceStickeringMask(pieceStickering));
		}
		return stickeringMask;
	}
};
var StickeringManager = class {
	constructor(kpuzzle) {
		this.kpuzzle = kpuzzle;
	}
	and(pieceSets) {
		const newPieceSet = new PieceAnnotation(this.kpuzzle, false);
		for (const orbitDefinition of this.kpuzzle.definition.orbits) pieceLoop: for (let i = 0; i < orbitDefinition.numPieces; i++) {
			newPieceSet.stickerings.get(orbitDefinition.orbitName)[i] = true;
			for (const pieceSet of pieceSets) if (!pieceSet.stickerings.get(orbitDefinition.orbitName)[i]) {
				newPieceSet.stickerings.get(orbitDefinition.orbitName)[i] = false;
				continue pieceLoop;
			}
		}
		return newPieceSet;
	}
	or(pieceSets) {
		const newPieceSet = new PieceAnnotation(this.kpuzzle, false);
		for (const orbitDefinition of this.kpuzzle.definition.orbits) pieceLoop: for (let i = 0; i < orbitDefinition.numPieces; i++) {
			newPieceSet.stickerings.get(orbitDefinition.orbitName)[i] = false;
			for (const pieceSet of pieceSets) if (pieceSet.stickerings.get(orbitDefinition.orbitName)[i]) {
				newPieceSet.stickerings.get(orbitDefinition.orbitName)[i] = true;
				continue pieceLoop;
			}
		}
		return newPieceSet;
	}
	not(pieceSet) {
		const newPieceSet = new PieceAnnotation(this.kpuzzle, false);
		for (const orbitDefinition of this.kpuzzle.definition.orbits) for (let i = 0; i < orbitDefinition.numPieces; i++) newPieceSet.stickerings.get(orbitDefinition.orbitName)[i] = !pieceSet.stickerings.get(orbitDefinition.orbitName)[i];
		return newPieceSet;
	}
	all() {
		return this.and(this.moves([]));
	}
	move(moveSource) {
		const transformation = this.kpuzzle.moveToTransformation(moveSource);
		const newPieceSet = new PieceAnnotation(this.kpuzzle, false);
		for (const orbitDefinition of this.kpuzzle.definition.orbits) for (let i = 0; i < orbitDefinition.numPieces; i++) if (transformation.transformationData[orbitDefinition.orbitName].permutation[i] !== i || transformation.transformationData[orbitDefinition.orbitName].orientationDelta[i] !== 0) newPieceSet.stickerings.get(orbitDefinition.orbitName)[i] = true;
		return newPieceSet;
	}
	moves(moveSources) {
		return moveSources.map((moveSource) => this.move(moveSource));
	}
	orbits(orbitNames) {
		const pieceSet = new PieceAnnotation(this.kpuzzle, false);
		for (const orbitName of orbitNames) pieceSet.stickerings.get(orbitName).fill(true);
		return pieceSet;
	}
	orbitPrefix(orbitPrefix) {
		const pieceSet = new PieceAnnotation(this.kpuzzle, false);
		for (const orbitDefinition of this.kpuzzle.definition.orbits) if (orbitDefinition.orbitName.startsWith(orbitPrefix)) pieceSet.stickerings.get(orbitDefinition.orbitName).fill(true);
		return pieceSet;
	}
};
var LL = "Last Layer";
var LS = "Last Slot";
var megaAnd3x3x3LL = {
	"3x3x3": LL,
	megaminx: LL
};
var megaAnd3x3x3LS = {
	"3x3x3": LS,
	megaminx: LS
};
var experimentalStickerings = {
	full: { groups: {
		"3x3x3": "Stickering",
		megaminx: "Stickering"
	} },
	OLL: { groups: megaAnd3x3x3LL },
	PLL: { groups: megaAnd3x3x3LL },
	LL: { groups: megaAnd3x3x3LL },
	EOLL: { groups: megaAnd3x3x3LL },
	COLL: { groups: megaAnd3x3x3LL },
	OCLL: { groups: megaAnd3x3x3LL },
	CPLL: { groups: megaAnd3x3x3LL },
	CLL: { groups: megaAnd3x3x3LL },
	EPLL: { groups: megaAnd3x3x3LL },
	ELL: { groups: megaAnd3x3x3LL },
	ZBLL: { groups: megaAnd3x3x3LL },
	LS: { groups: megaAnd3x3x3LS },
	LSOLL: { groups: megaAnd3x3x3LS },
	LSOCLL: { groups: megaAnd3x3x3LS },
	ELS: { groups: megaAnd3x3x3LS },
	CLS: { groups: megaAnd3x3x3LS },
	ZBLS: { groups: megaAnd3x3x3LS },
	VLS: { groups: megaAnd3x3x3LS },
	WVLS: { groups: megaAnd3x3x3LS },
	F2L: { groups: { "3x3x3": "CFOP (Fridrich)" } },
	Daisy: { groups: { "3x3x3": "CFOP (Fridrich)" } },
	Cross: { groups: { "3x3x3": "CFOP (Fridrich)" } },
	EO: { groups: { "3x3x3": "ZZ" } },
	EOline: { groups: { "3x3x3": "ZZ" } },
	EOcross: { groups: { "3x3x3": "ZZ" } },
	FirstBlock: { groups: { "3x3x3": "Roux" } },
	SecondBlock: { groups: { "3x3x3": "Roux" } },
	CMLL: { groups: { "3x3x3": "Roux" } },
	L10P: { groups: { "3x3x3": "Roux" } },
	L6E: { groups: { "3x3x3": "Roux" } },
	L6EO: { groups: { "3x3x3": "Roux" } },
	"2x2x2": { groups: { "3x3x3": "Petrus" } },
	"2x2x3": { groups: { "3x3x3": "Petrus" } },
	EODF: { groups: { "3x3x3": "Nautilus" } },
	G1: { groups: { "3x3x3": "FMC" } },
	L2C: { groups: {
		"4x4x4": "Reduction",
		"5x5x5": "Reduction",
		"6x6x6": "Reduction"
	} },
	OBL: { groups: { "2x2x2": "General" } },
	PBL: { groups: { "2x2x2": "Ortega" } },
	"Void Cube": { groups: { "3x3x3": "Miscellaneous" } },
	invisible: { groups: { "3x3x3": "Miscellaneous" } },
	picture: { groups: { "3x3x3": "Miscellaneous" } },
	"centers-only": { groups: { "3x3x3": "Miscellaneous" } },
	"opposite-centers": { groups: { "4x4x4": "Reduction" } },
	"experimental-centers-U": {},
	"experimental-centers-U-D": {},
	"experimental-centers-U-L-D": {},
	"experimental-centers-U-L-B-D": {},
	"experimental-centers": {},
	"experimental-fto-fc": { groups: { fto: "Bencisco" } },
	"experimental-fto-f2t": { groups: { fto: "Bencisco" } },
	"experimental-fto-sc": { groups: { fto: "Bencisco" } },
	"experimental-fto-l2c": { groups: { fto: "Bencisco" } },
	"experimental-fto-lbt": { groups: { fto: "Bencisco" } },
	"experimental-fto-l3t": { groups: { fto: "Bencisco" } }
};
async function cubeLikeStickeringMask(puzzleLoader, stickering) {
	return (await cubeLikePuzzleStickering(puzzleLoader, stickering)).toStickeringMask();
}
async function cubeLikePuzzleStickering(puzzleLoader, stickering) {
	const kpuzzle = await puzzleLoader.kpuzzle();
	const puzzleStickering = new PuzzleStickering(kpuzzle);
	const m = new StickeringManager(kpuzzle);
	const LL2 = () => m.move("U");
	const orUD = () => m.or(m.moves(["U", "D"]));
	const orLR = () => m.or(m.moves(["L", "R"]));
	const M = () => m.not(orLR());
	const F2L = () => m.not(LL2());
	const CENTERS = () => m.orbitPrefix("CENTER");
	const CENTER = (faceMove) => m.and([m.move(faceMove), CENTERS()]);
	const EDGES = () => m.orbitPrefix("EDGE");
	const EDGE = (faceMoves) => m.and([m.and(m.moves(faceMoves)), EDGES()]);
	const CORNERS = () => m.or([
		m.orbitPrefix("CORNER"),
		m.orbitPrefix("C4RNER"),
		m.orbitPrefix("C5RNER")
	]);
	const L6E = () => m.or([M(), m.and([LL2(), EDGES()])]);
	const centerLL = () => m.and([LL2(), CENTERS()]);
	const edgeFR = () => m.and([m.and(m.moves(["F", "R"])), EDGES()]);
	const cornerDFR = () => m.and([
		m.and(m.moves(["F", "R"])),
		CORNERS(),
		m.not(LL2())
	]);
	const slotFR = () => m.or([cornerDFR(), edgeFR()]);
	function dimF2L() {
		puzzleStickering.set(F2L(), "Dim");
	}
	function setPLL() {
		puzzleStickering.set(LL2(), "PermuteNonPrimary");
		puzzleStickering.set(centerLL(), "Dim");
	}
	function setOLL() {
		puzzleStickering.set(LL2(), "IgnoreNonPrimary");
		puzzleStickering.set(centerLL(), "Regular");
	}
	function dimOLL() {
		puzzleStickering.set(LL2(), "Ignoriented");
		puzzleStickering.set(centerLL(), "Dim");
	}
	switch (stickering) {
		case "full": break;
		case "PLL":
			dimF2L();
			setPLL();
			break;
		case "CLS":
			dimF2L();
			puzzleStickering.set(cornerDFR(), "Regular");
			puzzleStickering.set(LL2(), "Ignoriented");
			puzzleStickering.set(m.and([LL2(), CENTERS()]), "Dim");
			puzzleStickering.set(m.and([LL2(), CORNERS()]), "IgnoreNonPrimary");
			break;
		case "OLL":
			dimF2L();
			setOLL();
			break;
		case "EOLL":
			dimF2L();
			setOLL();
			puzzleStickering.set(m.and([LL2(), CORNERS()]), "Ignored");
			break;
		case "COLL":
			dimF2L();
			puzzleStickering.set(m.and([LL2(), EDGES()]), "Ignoriented");
			puzzleStickering.set(m.and([LL2(), CENTERS()]), "Dim");
			puzzleStickering.set(m.and([LL2(), CORNERS()]), "Regular");
			break;
		case "OCLL":
			dimF2L();
			dimOLL();
			puzzleStickering.set(m.and([LL2(), CORNERS()]), "IgnoreNonPrimary");
			break;
		case "CPLL":
			dimF2L();
			puzzleStickering.set(m.and([CORNERS(), LL2()]), "PermuteNonPrimary");
			puzzleStickering.set(m.and([m.not(CORNERS()), LL2()]), "Dim");
			break;
		case "CLL":
			dimF2L();
			puzzleStickering.set(m.not(m.and([CORNERS(), LL2()])), "Dim");
			break;
		case "EPLL":
			dimF2L();
			puzzleStickering.set(LL2(), "Dim");
			puzzleStickering.set(m.and([LL2(), EDGES()]), "PermuteNonPrimary");
			break;
		case "ELL":
			dimF2L();
			puzzleStickering.set(LL2(), "Dim");
			puzzleStickering.set(m.and([LL2(), EDGES()]), "Regular");
			break;
		case "ELS":
			dimF2L();
			setOLL();
			puzzleStickering.set(m.and([LL2(), CORNERS()]), "Ignored");
			puzzleStickering.set(edgeFR(), "Regular");
			puzzleStickering.set(cornerDFR(), "Ignored");
			break;
		case "LL":
			dimF2L();
			break;
		case "F2L":
			puzzleStickering.set(LL2(), "Ignored");
			break;
		case "ZBLL":
			dimF2L();
			puzzleStickering.set(LL2(), "PermuteNonPrimary");
			puzzleStickering.set(centerLL(), "Dim");
			puzzleStickering.set(m.and([LL2(), CORNERS()]), "Regular");
			break;
		case "ZBLS":
			dimF2L();
			puzzleStickering.set(slotFR(), "Regular");
			setOLL();
			puzzleStickering.set(m.and([LL2(), CORNERS()]), "Ignored");
			break;
		case "VLS":
			dimF2L();
			puzzleStickering.set(slotFR(), "Regular");
			setOLL();
			break;
		case "WVLS":
			dimF2L();
			puzzleStickering.set(slotFR(), "Regular");
			puzzleStickering.set(m.and([LL2(), EDGES()]), "Ignoriented");
			puzzleStickering.set(m.and([LL2(), CENTERS()]), "Dim");
			puzzleStickering.set(m.and([LL2(), CORNERS()]), "IgnoreNonPrimary");
			break;
		case "LS":
			dimF2L();
			puzzleStickering.set(slotFR(), "Regular");
			puzzleStickering.set(LL2(), "Ignored");
			puzzleStickering.set(centerLL(), "Dim");
			break;
		case "LSOLL":
			dimF2L();
			setOLL();
			puzzleStickering.set(slotFR(), "Regular");
			break;
		case "LSOCLL":
			dimF2L();
			dimOLL();
			puzzleStickering.set(m.and([LL2(), CORNERS()]), "IgnoreNonPrimary");
			puzzleStickering.set(slotFR(), "Regular");
			break;
		case "EO":
			puzzleStickering.set(CORNERS(), "Ignored");
			puzzleStickering.set(EDGES(), "OrientationWithoutPermutation");
			break;
		case "EOline":
			puzzleStickering.set(CORNERS(), "Ignored");
			puzzleStickering.set(EDGES(), "OrientationWithoutPermutation");
			puzzleStickering.set(m.and(m.moves(["D", "M"])), "Regular");
			break;
		case "EOcross":
			puzzleStickering.set(EDGES(), "OrientationWithoutPermutation");
			puzzleStickering.set(m.move("D"), "Regular");
			puzzleStickering.set(CORNERS(), "Ignored");
			break;
		case "CMLL":
			puzzleStickering.set(F2L(), "Dim");
			puzzleStickering.set(L6E(), "Ignored");
			puzzleStickering.set(m.and([LL2(), CORNERS()]), "Regular");
			break;
		case "L10P":
			puzzleStickering.set(m.not(L6E()), "Dim");
			puzzleStickering.set(m.and([CORNERS(), LL2()]), "Regular");
			break;
		case "L6E":
			puzzleStickering.set(m.not(L6E()), "Dim");
			break;
		case "L6EO":
			puzzleStickering.set(m.not(L6E()), "Dim");
			puzzleStickering.set(L6E(), "ExperimentalOrientationWithoutPermutation2");
			puzzleStickering.set(m.and([CENTERS(), orUD()]), "ExperimentalOrientationWithoutPermutation2");
			puzzleStickering.set(m.and([m.move("M"), m.move("E")]), "Ignored");
			break;
		case "Daisy":
			puzzleStickering.set(m.all(), "Ignored");
			puzzleStickering.set(CENTERS(), "Dim");
			puzzleStickering.set(m.and([m.move("D"), CENTERS()]), "Regular");
			puzzleStickering.set(m.and([m.move("U"), EDGES()]), "IgnoreNonPrimary");
			break;
		case "Cross":
			puzzleStickering.set(m.all(), "Ignored");
			puzzleStickering.set(CENTERS(), "Dim");
			puzzleStickering.set(m.and([m.move("D"), CENTERS()]), "Regular");
			puzzleStickering.set(m.and([m.move("D"), EDGES()]), "Regular");
			break;
		case "2x2x2":
			puzzleStickering.set(m.or(m.moves([
				"U",
				"F",
				"R"
			])), "Ignored");
			puzzleStickering.set(m.and([m.or(m.moves([
				"U",
				"F",
				"R"
			])), CENTERS()]), "Dim");
			break;
		case "2x2x3":
			puzzleStickering.set(m.all(), "Dim");
			puzzleStickering.set(m.or(m.moves([
				"U",
				"F",
				"R"
			])), "Ignored");
			puzzleStickering.set(m.and([m.or(m.moves([
				"U",
				"F",
				"R"
			])), CENTERS()]), "Dim");
			puzzleStickering.set(m.and([m.move("F"), m.not(m.or(m.moves(["U", "R"])))]), "Regular");
			break;
		case "G1":
			puzzleStickering.set(m.all(), "ExperimentalOrientationWithoutPermutation2");
			puzzleStickering.set(m.or(m.moves(["E"])), "OrientationWithoutPermutation");
			puzzleStickering.set(m.and(m.moves(["E", "S"])), "Ignored");
			break;
		case "L2C":
			puzzleStickering.set(m.or(m.moves([
				"L",
				"R",
				"B",
				"D"
			])), "Dim");
			puzzleStickering.set(m.not(CENTERS()), "Ignored");
			break;
		case "PBL":
			puzzleStickering.set(m.all(), "Ignored");
			puzzleStickering.set(m.or(m.moves(["U", "D"])), "PermuteNonPrimary");
			break;
		case "FirstBlock":
			puzzleStickering.set(m.not(m.and([m.and(m.moves(["L"])), m.not(LL2())])), "Ignored");
			puzzleStickering.set(CENTER("R"), "Dim");
			break;
		case "SecondBlock":
			puzzleStickering.set(m.not(m.and([m.and(m.moves(["L"])), m.not(LL2())])), "Ignored");
			puzzleStickering.set(m.and([m.and(m.moves(["L"])), m.not(LL2())]), "Dim");
			puzzleStickering.set(m.and([m.and(m.moves(["R"])), m.not(LL2())]), "Regular");
			break;
		case "EODF":
			dimF2L();
			puzzleStickering.set(m.or([cornerDFR(), m.and([LL2(), CORNERS()])]), "Ignored");
			puzzleStickering.set(m.or([m.and([LL2(), EDGES()]), edgeFR()]), "OrientationWithoutPermutation");
			puzzleStickering.set(EDGE(["D", "F"]), "Regular");
			puzzleStickering.set(CENTER("F"), "Regular");
			break;
		case "Void Cube":
			puzzleStickering.set(CENTERS(), "Invisible");
			break;
		case "picture":
		case "invisible":
			puzzleStickering.set(m.all(), "Invisible");
			break;
		case "centers-only":
			puzzleStickering.set(m.not(CENTERS()), "Ignored");
			break;
		case "opposite-centers":
			puzzleStickering.set(m.not(m.and([CENTERS(), m.or(m.moves(["U", "D"]))])), "Ignored");
			break;
		case "OBL":
			puzzleStickering.set(m.or(m.moves(["U", "D"])), "IgnoreNonPrimary");
			break;
		default:
			console.warn(`Unsupported stickering for ${puzzleLoader.id}: ${stickering}. Setting all pieces to dim.`);
			puzzleStickering.set(m.and(m.moves([])), "Dim");
	}
	return puzzleStickering;
}
async function cubeLikeStickeringList(puzzleID, options) {
	const stickerings = [];
	const stickeringsFallback = [];
	for (const [name, info] of Object.entries(experimentalStickerings)) if (info.groups) {
		if (puzzleID in info.groups) stickerings.push(name);
		else if (options?.use3x3x3Fallbacks && "3x3x3" in info.groups) stickeringsFallback.push(name);
	}
	return stickerings.concat(stickeringsFallback);
}
function getCached(getValue) {
	let cachedPromise = null;
	return () => {
		return cachedPromise ??= getValue();
	};
}
async function asyncGetPuzzleGeometry(puzzleName) {
	return (await import("./puzzle-geometry.js")).getPuzzleGeometryByName(puzzleName, {
		allMoves: true,
		orientCenters: true,
		addRotations: true
	});
}
async function asyncGetBasePuzzleGeometry(puzzleName) {
	return (await import("./puzzle-geometry.js")).getPuzzleGeometryByName(puzzleName);
}
async function asyncGetKPuzzle(pgPromise, puzzleName, setOrientationModTo1ForPiecesOfOrbits) {
	const pg = await pgPromise;
	const kpuzzleDefinition = pg.getKPuzzleDefinition(true);
	kpuzzleDefinition.name = puzzleName;
	const pgNotation = new (await (import("./puzzle-geometry.js"))).ExperimentalPGNotation(pg, pg.getOrbitsDef(true));
	if (setOrientationModTo1ForPiecesOfOrbits) {
		const setOrientationModTo1ForPiecesOfOrbitsSet = new Set(setOrientationModTo1ForPiecesOfOrbits);
		for (const [orbitName, orbitData] of Object.entries(kpuzzleDefinition.defaultPattern)) if (setOrientationModTo1ForPiecesOfOrbitsSet.has(orbitName)) orbitData.orientationMod = new Array(orbitData.pieces.length).fill(1);
	}
	return new KPuzzle(pgNotation.remapKPuzzleDefinition(kpuzzleDefinition), { experimentalPGNotation: pgNotation });
}
var PGPuzzleLoader = class {
	pgId;
	id;
	fullName;
	inventedBy;
	inventionYear;
	#setOrientationModTo1ForPiecesOfOrbits;
	constructor(info) {
		this.pgId = info.pgID;
		this.id = info.id;
		this.fullName = info.fullName;
		this.inventedBy = info.inventedBy;
		this.inventionYear = info.inventionYear;
		this.#setOrientationModTo1ForPiecesOfOrbits = info.setOrientationModTo1ForPiecesOfOrbits;
	}
	#cachedPG;
	pg() {
		return this.#cachedPG ??= asyncGetPuzzleGeometry(this.pgId ?? this.id);
	}
	#cachedBasePG;
	basePG() {
		return this.#cachedBasePG ??= asyncGetBasePuzzleGeometry(this.pgId ?? this.id);
	}
	#cachedKPuzzle;
	kpuzzle() {
		return this.#cachedKPuzzle ??= asyncGetKPuzzle(this.pg(), this.id, this.#setOrientationModTo1ForPiecesOfOrbits);
	}
	#cachedSVG;
	svg() {
		return this.#cachedSVG ??= (async () => (await this.pg()).generatesvg())();
	}
	puzzleSpecificSimplifyOptionsPromise = puzzleSpecificSimplifyOptionsPromise(this.kpuzzle.bind(this));
};
var CubePGPuzzleLoader = class extends PGPuzzleLoader {
	stickeringMask(stickering) {
		return cubeLikeStickeringMask(this, stickering);
	}
	stickerings = () => cubeLikeStickeringList(this.id, { use3x3x3Fallbacks: true });
	algTransformData = cubeMirrorTransforms;
};
function puzzleSpecificSimplifyOptionsPromise(kpuzzlePromiseFn) {
	return new PLazy(async (resolve) => {
		const kpuzzle = await kpuzzlePromiseFn();
		resolve({ quantumMoveOrder: (m) => {
			return kpuzzle.moveToTransformation(new Move(m)).repetitionOrder();
		} });
	});
}
var cube3x3x3KPuzzleDefinition = {
	name: "3x3x3",
	orbits: [
		{
			orbitName: "EDGES",
			numPieces: 12,
			numOrientations: 2
		},
		{
			orbitName: "CORNERS",
			numPieces: 8,
			numOrientations: 3
		},
		{
			orbitName: "CENTERS",
			numPieces: 6,
			numOrientations: 4
		}
	],
	defaultPattern: {
		EDGES: {
			pieces: [
				0,
				1,
				2,
				3,
				4,
				5,
				6,
				7,
				8,
				9,
				10,
				11
			],
			orientation: [
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				0
			]
		},
		CORNERS: {
			pieces: [
				0,
				1,
				2,
				3,
				4,
				5,
				6,
				7
			],
			orientation: [
				0,
				0,
				0,
				0,
				0,
				0,
				0,
				0
			]
		},
		CENTERS: {
			pieces: [
				0,
				1,
				2,
				3,
				4,
				5
			],
			orientation: [
				0,
				0,
				0,
				0,
				0,
				0
			],
			orientationMod: [
				1,
				1,
				1,
				1,
				1,
				1
			]
		}
	},
	moves: {
		U: {
			EDGES: {
				permutation: [
					1,
					2,
					3,
					0,
					4,
					5,
					6,
					7,
					8,
					9,
					10,
					11
				],
				orientationDelta: [
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0
				]
			},
			CORNERS: {
				permutation: [
					1,
					2,
					3,
					0,
					4,
					5,
					6,
					7
				],
				orientationDelta: [
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0
				]
			},
			CENTERS: {
				permutation: [
					0,
					1,
					2,
					3,
					4,
					5
				],
				orientationDelta: [
					1,
					0,
					0,
					0,
					0,
					0
				]
			}
		},
		y: {
			EDGES: {
				permutation: [
					1,
					2,
					3,
					0,
					5,
					6,
					7,
					4,
					10,
					8,
					11,
					9
				],
				orientationDelta: [
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					1,
					1,
					1,
					1
				]
			},
			CORNERS: {
				permutation: [
					1,
					2,
					3,
					0,
					7,
					4,
					5,
					6
				],
				orientationDelta: [
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0
				]
			},
			CENTERS: {
				permutation: [
					0,
					2,
					3,
					4,
					1,
					5
				],
				orientationDelta: [
					1,
					0,
					0,
					0,
					0,
					3
				]
			}
		},
		x: {
			EDGES: {
				permutation: [
					4,
					8,
					0,
					9,
					6,
					10,
					2,
					11,
					5,
					7,
					1,
					3
				],
				orientationDelta: [
					1,
					0,
					1,
					0,
					1,
					0,
					1,
					0,
					0,
					0,
					0,
					0
				]
			},
			CORNERS: {
				permutation: [
					4,
					0,
					3,
					5,
					7,
					6,
					2,
					1
				],
				orientationDelta: [
					2,
					1,
					2,
					1,
					1,
					2,
					1,
					2
				]
			},
			CENTERS: {
				permutation: [
					2,
					1,
					5,
					3,
					0,
					4
				],
				orientationDelta: [
					0,
					3,
					0,
					1,
					2,
					2
				]
			}
		},
		L: {
			EDGES: {
				permutation: [
					0,
					1,
					2,
					11,
					4,
					5,
					6,
					9,
					8,
					3,
					10,
					7
				],
				orientationDelta: [
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0
				]
			},
			CORNERS: {
				permutation: [
					0,
					1,
					6,
					2,
					4,
					3,
					5,
					7
				],
				orientationDelta: [
					0,
					0,
					2,
					1,
					0,
					2,
					1,
					0
				]
			},
			CENTERS: {
				permutation: [
					0,
					1,
					2,
					3,
					4,
					5
				],
				orientationDelta: [
					0,
					1,
					0,
					0,
					0,
					0
				]
			}
		},
		F: {
			EDGES: {
				permutation: [
					9,
					1,
					2,
					3,
					8,
					5,
					6,
					7,
					0,
					4,
					10,
					11
				],
				orientationDelta: [
					1,
					0,
					0,
					0,
					1,
					0,
					0,
					0,
					1,
					1,
					0,
					0
				]
			},
			CORNERS: {
				permutation: [
					3,
					1,
					2,
					5,
					0,
					4,
					6,
					7
				],
				orientationDelta: [
					1,
					0,
					0,
					2,
					2,
					1,
					0,
					0
				]
			},
			CENTERS: {
				permutation: [
					0,
					1,
					2,
					3,
					4,
					5
				],
				orientationDelta: [
					0,
					0,
					1,
					0,
					0,
					0
				]
			}
		},
		R: {
			EDGES: {
				permutation: [
					0,
					8,
					2,
					3,
					4,
					10,
					6,
					7,
					5,
					9,
					1,
					11
				],
				orientationDelta: [
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0
				]
			},
			CORNERS: {
				permutation: [
					4,
					0,
					2,
					3,
					7,
					5,
					6,
					1
				],
				orientationDelta: [
					2,
					1,
					0,
					0,
					1,
					0,
					0,
					2
				]
			},
			CENTERS: {
				permutation: [
					0,
					1,
					2,
					3,
					4,
					5
				],
				orientationDelta: [
					0,
					0,
					0,
					1,
					0,
					0
				]
			}
		},
		B: {
			EDGES: {
				permutation: [
					0,
					1,
					10,
					3,
					4,
					5,
					11,
					7,
					8,
					9,
					6,
					2
				],
				orientationDelta: [
					0,
					0,
					1,
					0,
					0,
					0,
					1,
					0,
					0,
					0,
					1,
					1
				]
			},
			CORNERS: {
				permutation: [
					0,
					7,
					1,
					3,
					4,
					5,
					2,
					6
				],
				orientationDelta: [
					0,
					2,
					1,
					0,
					0,
					0,
					2,
					1
				]
			},
			CENTERS: {
				permutation: [
					0,
					1,
					2,
					3,
					4,
					5
				],
				orientationDelta: [
					0,
					0,
					0,
					0,
					1,
					0
				]
			}
		},
		D: {
			EDGES: {
				permutation: [
					0,
					1,
					2,
					3,
					7,
					4,
					5,
					6,
					8,
					9,
					10,
					11
				],
				orientationDelta: [
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0
				]
			},
			CORNERS: {
				permutation: [
					0,
					1,
					2,
					3,
					5,
					6,
					7,
					4
				],
				orientationDelta: [
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0
				]
			},
			CENTERS: {
				permutation: [
					0,
					1,
					2,
					3,
					4,
					5
				],
				orientationDelta: [
					0,
					0,
					0,
					0,
					0,
					1
				]
			}
		},
		z: {
			EDGES: {
				permutation: [
					9,
					3,
					11,
					7,
					8,
					1,
					10,
					5,
					0,
					4,
					2,
					6
				],
				orientationDelta: [
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1,
					1
				]
			},
			CORNERS: {
				permutation: [
					3,
					2,
					6,
					5,
					0,
					4,
					7,
					1
				],
				orientationDelta: [
					1,
					2,
					1,
					2,
					2,
					1,
					2,
					1
				]
			},
			CENTERS: {
				permutation: [
					1,
					5,
					2,
					0,
					4,
					3
				],
				orientationDelta: [
					1,
					1,
					1,
					1,
					3,
					1
				]
			}
		},
		M: {
			EDGES: {
				permutation: [
					2,
					1,
					6,
					3,
					0,
					5,
					4,
					7,
					8,
					9,
					10,
					11
				],
				orientationDelta: [
					1,
					0,
					1,
					0,
					1,
					0,
					1,
					0,
					0,
					0,
					0,
					0
				]
			},
			CORNERS: {
				permutation: [
					0,
					1,
					2,
					3,
					4,
					5,
					6,
					7
				],
				orientationDelta: [
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0
				]
			},
			CENTERS: {
				permutation: [
					4,
					1,
					0,
					3,
					5,
					2
				],
				orientationDelta: [
					2,
					0,
					0,
					0,
					2,
					0
				]
			}
		},
		E: {
			EDGES: {
				permutation: [
					0,
					1,
					2,
					3,
					4,
					5,
					6,
					7,
					9,
					11,
					8,
					10
				],
				orientationDelta: [
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					1,
					1,
					1,
					1
				]
			},
			CORNERS: {
				permutation: [
					0,
					1,
					2,
					3,
					4,
					5,
					6,
					7
				],
				orientationDelta: [
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0
				]
			},
			CENTERS: {
				permutation: [
					0,
					4,
					1,
					2,
					3,
					5
				],
				orientationDelta: [
					0,
					0,
					0,
					0,
					0,
					0
				]
			}
		},
		S: {
			EDGES: {
				permutation: [
					0,
					3,
					2,
					7,
					4,
					1,
					6,
					5,
					8,
					9,
					10,
					11
				],
				orientationDelta: [
					0,
					1,
					0,
					1,
					0,
					1,
					0,
					1,
					0,
					0,
					0,
					0
				]
			},
			CORNERS: {
				permutation: [
					0,
					1,
					2,
					3,
					4,
					5,
					6,
					7
				],
				orientationDelta: [
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0
				]
			},
			CENTERS: {
				permutation: [
					1,
					5,
					2,
					0,
					4,
					3
				],
				orientationDelta: [
					1,
					1,
					0,
					1,
					0,
					1
				]
			}
		},
		u: {
			EDGES: {
				permutation: [
					1,
					2,
					3,
					0,
					4,
					5,
					6,
					7,
					10,
					8,
					11,
					9
				],
				orientationDelta: [
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					1,
					1,
					1,
					1
				]
			},
			CORNERS: {
				permutation: [
					1,
					2,
					3,
					0,
					4,
					5,
					6,
					7
				],
				orientationDelta: [
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0
				]
			},
			CENTERS: {
				permutation: [
					0,
					2,
					3,
					4,
					1,
					5
				],
				orientationDelta: [
					1,
					0,
					0,
					0,
					0,
					0
				]
			}
		},
		l: {
			EDGES: {
				permutation: [
					2,
					1,
					6,
					11,
					0,
					5,
					4,
					9,
					8,
					3,
					10,
					7
				],
				orientationDelta: [
					1,
					0,
					1,
					0,
					1,
					0,
					1,
					0,
					0,
					0,
					0,
					0
				]
			},
			CORNERS: {
				permutation: [
					0,
					1,
					6,
					2,
					4,
					3,
					5,
					7
				],
				orientationDelta: [
					0,
					0,
					2,
					1,
					0,
					2,
					1,
					0
				]
			},
			CENTERS: {
				permutation: [
					4,
					1,
					0,
					3,
					5,
					2
				],
				orientationDelta: [
					2,
					1,
					0,
					0,
					2,
					0
				]
			}
		},
		f: {
			EDGES: {
				permutation: [
					9,
					3,
					2,
					7,
					8,
					1,
					6,
					5,
					0,
					4,
					10,
					11
				],
				orientationDelta: [
					1,
					1,
					0,
					1,
					1,
					1,
					0,
					1,
					1,
					1,
					0,
					0
				]
			},
			CORNERS: {
				permutation: [
					3,
					1,
					2,
					5,
					0,
					4,
					6,
					7
				],
				orientationDelta: [
					1,
					0,
					0,
					2,
					2,
					1,
					0,
					0
				]
			},
			CENTERS: {
				permutation: [
					1,
					5,
					2,
					0,
					4,
					3
				],
				orientationDelta: [
					1,
					1,
					1,
					1,
					0,
					1
				]
			}
		},
		r: {
			EDGES: {
				permutation: [
					4,
					8,
					0,
					3,
					6,
					10,
					2,
					7,
					5,
					9,
					1,
					11
				],
				orientationDelta: [
					1,
					0,
					1,
					0,
					1,
					0,
					1,
					0,
					0,
					0,
					0,
					0
				]
			},
			CORNERS: {
				permutation: [
					4,
					0,
					2,
					3,
					7,
					5,
					6,
					1
				],
				orientationDelta: [
					2,
					1,
					0,
					0,
					1,
					0,
					0,
					2
				]
			},
			CENTERS: {
				permutation: [
					2,
					1,
					5,
					3,
					0,
					4
				],
				orientationDelta: [
					0,
					0,
					0,
					1,
					2,
					2
				]
			}
		},
		b: {
			EDGES: {
				permutation: [
					0,
					5,
					10,
					1,
					4,
					7,
					11,
					3,
					8,
					9,
					6,
					2
				],
				orientationDelta: [
					0,
					1,
					1,
					1,
					0,
					1,
					1,
					1,
					0,
					0,
					1,
					1
				]
			},
			CORNERS: {
				permutation: [
					0,
					7,
					1,
					3,
					4,
					5,
					2,
					6
				],
				orientationDelta: [
					0,
					2,
					1,
					0,
					0,
					0,
					2,
					1
				]
			},
			CENTERS: {
				permutation: [
					3,
					0,
					2,
					5,
					4,
					1
				],
				orientationDelta: [
					3,
					3,
					0,
					3,
					1,
					3
				]
			}
		},
		d: {
			EDGES: {
				permutation: [
					0,
					1,
					2,
					3,
					7,
					4,
					5,
					6,
					9,
					11,
					8,
					10
				],
				orientationDelta: [
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					1,
					1,
					1,
					1
				]
			},
			CORNERS: {
				permutation: [
					0,
					1,
					2,
					3,
					5,
					6,
					7,
					4
				],
				orientationDelta: [
					0,
					0,
					0,
					0,
					0,
					0,
					0,
					0
				]
			},
			CENTERS: {
				permutation: [
					0,
					4,
					1,
					2,
					3,
					5
				],
				orientationDelta: [
					0,
					0,
					0,
					0,
					0,
					1
				]
			}
		}
	},
	derivedMoves: {
		Uw: "u",
		Lw: "l",
		Fw: "f",
		Rw: "r",
		Bw: "b",
		Dw: "d",
		Uv: "y",
		Lv: "x'",
		Fv: "z",
		Rv: "x",
		Bv: "z'",
		Dv: "y'",
		"2U": "u U'",
		"2L": "l L'",
		"2F": "f F'",
		"2R": "r R'",
		"2B": "b B'",
		"2D": "d D'"
	}
};
function puzzleOrientation3x3x3Idx(pattern) {
	const idxU = pattern.patternData["CENTERS"].pieces[0];
	const idxD = pattern.patternData["CENTERS"].pieces[5];
	const unadjustedIdxL = pattern.patternData["CENTERS"].pieces[1];
	let idxL = unadjustedIdxL;
	if (idxU < unadjustedIdxL) idxL--;
	if (idxD < unadjustedIdxL) idxL--;
	return [idxU, idxL];
}
var puzzleOrientationCacheRaw = new Array(6).fill(0).map(() => {
	return new Array(6);
});
var puzzleOrientationCacheInitialized = false;
function puzzleOrientation3x3x3Cache() {
	if (!puzzleOrientationCacheInitialized) {
		const uAlgs = [
			"",
			"z",
			"x",
			"z'",
			"x'",
			"x2"
		].map((s) => Alg.fromString(s));
		const yAlg = new Alg("y");
		for (const uAlg of uAlgs) {
			let transformation = experimental3x3x3KPuzzle.algToTransformation(uAlg);
			for (let i = 0; i < 4; i++) {
				transformation = transformation.applyAlg(yAlg);
				const [idxU, idxL] = puzzleOrientation3x3x3Idx(transformation.toKPattern());
				puzzleOrientationCacheRaw[idxU][idxL] = transformation.invert();
			}
		}
	}
	return puzzleOrientationCacheRaw;
}
function normalize3x3x3Orientation(pattern) {
	const [idxU, idxL] = puzzleOrientation3x3x3Idx(pattern);
	const orientationTransformation = puzzleOrientation3x3x3Cache()[idxU][idxL];
	return pattern.applyTransformation(orientationTransformation);
}
function experimentalIs3x3x3Solved(pattern, options) {
	if (options.ignorePuzzleOrientation) pattern = normalize3x3x3Orientation(pattern);
	if (options.ignoreCenterOrientation) pattern = new KPattern(pattern.kpuzzle, {
		EDGES: pattern.patternData["EDGES"],
		CORNERS: pattern.patternData["CORNERS"],
		CENTERS: {
			pieces: pattern.patternData["CENTERS"].pieces,
			orientation: new Array(6).fill(0)
		}
	});
	return !!pattern.experimentalToTransformation()?.isIdentityTransformation();
}
var TransformAlg = class extends TraversalDownUp {
	traverseAlg(alg, dataDown) {
		const algNodes = [];
		for (const algNode of alg.childAlgNodes()) algNodes.push(this.traverseAlgNode(algNode, dataDown));
		return new Alg(algNodes);
	}
	traverseGrouping(grouping, dataDown) {
		return grouping.modified({ alg: this.traverseAlg(grouping.alg, dataDown) });
	}
	traverseMove(move, dataDown) {
		const invert = (() => {
			const { invertExceptByFamily } = dataDown;
			if (!invertExceptByFamily) return false;
			return !invertExceptByFamily.has(move.family);
		})();
		return move.modified({
			amount: invert ? -move.amount : move.amount,
			family: dataDown.replaceMovesByFamily[move.family] ?? move.family
		});
	}
	traverseCommutator(commutator, dataDown) {
		return new Commutator(this.traverseAlg(commutator.A, dataDown), this.traverseAlg(commutator.B, dataDown));
	}
	traverseConjugate(conjugate, dataDown) {
		return new Conjugate(this.traverseAlg(conjugate.A, dataDown), this.traverseAlg(conjugate.B, dataDown));
	}
	traversePause(pause, _dataDown) {
		return pause;
	}
	traverseNewline(newLine, _dataDown) {
		return newLine;
	}
	traverseLineComment(comment, _dataDown) {
		return comment;
	}
};
functionFromTraversal(TransformAlg);
async function descAsyncGetPuzzleGeometry(desc, options) {
	return (await import("./puzzle-geometry.js")).getPuzzleGeometryByDesc(desc, {
		allMoves: options?.allMoves ?? true,
		orientCenters: options?.orientCenters ?? true,
		addRotations: options?.addRotations ?? true,
		...options
	});
}
async function asyncGetKPuzzleByDesc(desc, options) {
	return asyncGetKPuzzle(descAsyncGetPuzzleGeometry(desc, options), `description: ${desc}`);
}
function puzzleOrientation2x2x2Idx(pattern) {
	const inverseDFL = pattern.experimentalToTransformation().invert().transformationData["CORNERS"];
	return inverseDFL.permutation[6] * 3 + inverseDFL.orientationDelta[6];
}
var puzzleOrientationCacheRaw2 = new Array(24);
var puzzleOrientationCacheInitialized2 = false;
function puzzleOrientation2x2x2Cache(kpuzzle) {
	if (!puzzleOrientationCacheInitialized2) {
		const uAlgs = [
			"",
			"z",
			"x",
			"z'",
			"x'",
			"x2"
		].map((s) => Alg.fromString(s));
		const yAlg = new Alg("y");
		for (const uAlg of uAlgs) {
			let transformation = kpuzzle.algToTransformation(uAlg);
			for (let i = 0; i < 4; i++) {
				transformation = transformation.applyAlg(yAlg);
				const idx = puzzleOrientation2x2x2Idx(transformation.toKPattern());
				puzzleOrientationCacheRaw2[idx] = {
					transformation: transformation.invert(),
					alg: uAlg.concat(yAlg)
				};
			}
		}
	}
	return puzzleOrientationCacheRaw2;
}
function normalize2x2x2Orientation(pattern) {
	const idx = puzzleOrientation2x2x2Idx(pattern);
	const { transformation, alg } = puzzleOrientation2x2x2Cache(pattern.kpuzzle)[idx];
	return {
		normalizedPattern: pattern.applyTransformation(transformation),
		normalizationAlg: alg.invert()
	};
}
function experimentalIs2x2x2Solved(pattern, options) {
	if (options.ignorePuzzleOrientation) pattern = normalize2x2x2Orientation(pattern).normalizedPattern;
	return !!pattern.experimentalToTransformation().isIdentityTransformation();
}
var experimental3x3x3KPuzzle = new KPuzzle(cube3x3x3KPuzzleDefinition);
cube3x3x3KPuzzleDefinition.experimentalIsPatternSolved = experimentalIs3x3x3Solved;
var bigCubePuzzleOrientation = getCached(() => import("./big-puzzle-orientation-ZVZQJEF5.js"));
var cube3x3x3KeyMapping = {
	KeyI: new Move("R"),
	KeyK: new Move("R'"),
	KeyW: new Move("B"),
	KeyO: new Move("B'"),
	KeyS: new Move("D"),
	KeyL: new Move("D'"),
	KeyD: new Move("L"),
	KeyE: new Move("L'"),
	KeyJ: new Move("U"),
	KeyF: new Move("U'"),
	KeyH: new Move("F"),
	KeyG: new Move("F'"),
	KeyC: new Move("l"),
	KeyR: new Move("l'"),
	KeyU: new Move("r"),
	KeyM: new Move("r'"),
	KeyX: new Move("d"),
	Comma: new Move("d'"),
	KeyT: new Move("x"),
	KeyY: new Move("x"),
	KeyV: new Move("x'"),
	KeyN: new Move("x'"),
	Semicolon: new Move("y"),
	KeyA: new Move("y'"),
	KeyP: new Move("z"),
	KeyQ: new Move("z'"),
	KeyZ: new Move("M'"),
	KeyB: new Move("M"),
	Period: new Move("M'"),
	Backquote: new Pause()
};
function makeSourceInfo(moveStrings, type, from2, to) {
	const output = [];
	for (const moveString of moveStrings) {
		const { family, amount: direction } = Move.fromString(moveString);
		if (![-1, 1].includes(direction)) throw new Error("Invalid config move");
		output.push({
			family,
			direction,
			type,
			from: from2,
			to
		});
	}
	return output;
}
var axisInfos = {
	["x axis"]: {
		sliceDiameter: 3,
		extendsThroughEntirePuzzle: true,
		moveSourceInfos: [
			...makeSourceInfo(["R"], 0, 0, 3),
			...makeSourceInfo(["L'"], 1, 0, 3),
			...makeSourceInfo(["r", "Rw"], 2, 0, 2),
			...makeSourceInfo(["l'", "Lw'"], 3, 0, 2),
			...makeSourceInfo(["M'"], 4, 1, 2),
			...makeSourceInfo([
				"x",
				"Uv",
				"Dv'"
			], 5, 0, 3)
		]
	},
	["y axis"]: {
		sliceDiameter: 3,
		extendsThroughEntirePuzzle: true,
		moveSourceInfos: [
			...makeSourceInfo(["U"], 0, 0, 3),
			...makeSourceInfo(["D'"], 1, 0, 3),
			...makeSourceInfo(["u", "Uw"], 2, 0, 2),
			...makeSourceInfo(["d'", "Dw'"], 3, 0, 2),
			...makeSourceInfo(["E'"], 4, 1, 2),
			...makeSourceInfo([
				"y",
				"Uv",
				"Dv'"
			], 5, 0, 3)
		]
	},
	["z axis"]: {
		sliceDiameter: 3,
		extendsThroughEntirePuzzle: true,
		moveSourceInfos: [
			...makeSourceInfo(["F"], 0, 0, 3),
			...makeSourceInfo(["B'"], 1, 0, 3),
			...makeSourceInfo(["f", "Fw"], 2, 0, 3),
			...makeSourceInfo(["b'", "Bw'"], 3, 0, 3),
			...makeSourceInfo(["S"], 4, 1, 2),
			...makeSourceInfo([
				"z",
				"Fv",
				"Bv'"
			], 5, 0, 3)
		]
	}
};
var byFamily = {};
for (const [axis, info] of Object.entries(axisInfos)) for (const moveSourceInfo of info.moveSourceInfos) byFamily[moveSourceInfo.family] = {
	axis,
	moveSourceInfo
};
var byAxisThenType = {};
for (const axis of Object.keys(axisInfos)) {
	const entry = {};
	byAxisThenType[axis] = entry;
	for (const moveSourceInfo of axisInfos[axis].moveSourceInfos) (entry[moveSourceInfo.type] ??= []).push(moveSourceInfo);
}
var byAxisThenSpecificSlices = {};
for (const axis of Object.keys(axisInfos)) {
	const entry = /* @__PURE__ */ new Map();
	byAxisThenSpecificSlices[axis] = entry;
	for (const moveSourceInfo of axisInfos[axis].moveSourceInfos) if (!entry.get(moveSourceInfo.from)) entry.set(moveSourceInfo.from, moveSourceInfo);
}
function firstOfType(axis, moveSourceType) {
	const entry = byAxisThenType[axis][moveSourceType]?.[0];
	if (!entry) throw new Error(`Could not find a reference move (axis: ${axis}, move source type: ${moveSourceType})`);
	return entry;
}
var areQuantumMovesSameAxis = (quantumMove1, quantumMove2) => {
	return byFamily[quantumMove1.family].axis === byFamily[quantumMove2.family].axis;
};
function simplestMove(axis, from2, to, directedAmount) {
	if (from2 + 1 === to) {
		const sliceSpecificInfo = byAxisThenSpecificSlices[axis].get(from2);
		if (sliceSpecificInfo) return new Move(new QuantumMove(sliceSpecificInfo.family), directedAmount * sliceSpecificInfo.direction);
	}
	const { sliceDiameter } = axisInfos[axis];
	if (from2 === 0 && to === sliceDiameter) {
		const moveSourceInfo2 = firstOfType(axis, 5);
		return new Move(new QuantumMove(moveSourceInfo2.family), directedAmount * moveSourceInfo2.direction);
	}
	const far = from2 + to > sliceDiameter;
	if (far) [from2, to] = [sliceDiameter - to, sliceDiameter - from2];
	let outerLayer = from2 + 1;
	let innerLayer = to;
	const slice = outerLayer === innerLayer;
	if (slice) innerLayer = null;
	if (outerLayer === 1) outerLayer = null;
	if (slice && outerLayer === 1) innerLayer = null;
	if (!slice && innerLayer === 2) innerLayer = null;
	const moveSourceInfo = firstOfType(axis, slice ? far ? 1 : 0 : far ? 3 : 2);
	return new Move(new QuantumMove(moveSourceInfo.family, innerLayer, outerLayer), directedAmount * moveSourceInfo.direction);
}
function simplifySameAxisMoves(moves, quantumMod = true) {
	if (moves.length === 0) return [];
	const axis = byFamily[moves[0].family].axis;
	const { sliceDiameter } = axisInfos[axis];
	const sliceDeltas = /* @__PURE__ */ new Map();
	let lastCandidateRange = null;
	function adjustValue(idx, relativeDelta) {
		let newDelta = (sliceDeltas.get(idx) ?? 0) + relativeDelta;
		if (quantumMod) newDelta = newDelta % 4 + 5 % 4 - 1;
		if (newDelta === 0) sliceDeltas.delete(idx);
		else sliceDeltas.set(idx, newDelta);
	}
	let suffixLength = 0;
	for (const move of Array.from(moves).reverse()) {
		suffixLength++;
		const { moveSourceInfo } = byFamily[move.family];
		const directedAmount2 = move.amount * moveSourceInfo.direction;
		switch (moveSourceInfo.type) {
			case 0: {
				const idx = (move.innerLayer ?? 1) - 1;
				adjustValue(idx, directedAmount2);
				adjustValue(idx + 1, -directedAmount2);
				break;
			}
			case 1: {
				const idx = sliceDiameter - (move.innerLayer ?? 1);
				adjustValue(idx, directedAmount2);
				adjustValue(idx + 1, -directedAmount2);
				break;
			}
			case 2:
				adjustValue((move.outerLayer ?? 1) - 1, directedAmount2);
				adjustValue(move.innerLayer ?? 2, -directedAmount2);
				break;
			case 3:
				adjustValue(sliceDiameter - (move.innerLayer ?? 2), directedAmount2);
				adjustValue(sliceDiameter - ((move.outerLayer ?? 1) - 1), -directedAmount2);
				break;
			case 4:
				adjustValue(moveSourceInfo.from, directedAmount2);
				adjustValue(moveSourceInfo.to, -directedAmount2);
				break;
			case 5:
				adjustValue(0, directedAmount2);
				adjustValue(sliceDiameter, -directedAmount2);
				break;
		}
		if ([0, 2].includes(sliceDeltas.size)) lastCandidateRange = {
			suffixLength,
			sliceDeltas: new Map(sliceDeltas)
		};
	}
	if (sliceDeltas.size === 0) return [];
	if (!lastCandidateRange) return moves;
	let [from2, to] = lastCandidateRange.sliceDeltas.keys();
	if (from2 > to) [from2, to] = [to, from2];
	const directedAmount = lastCandidateRange.sliceDeltas.get(from2);
	return [...moves.slice(0, -lastCandidateRange.suffixLength), ...directedAmount !== 0 ? [simplestMove(axis, from2, to, directedAmount)] : []];
}
var puzzleSpecificSimplifyOptions333 = {
	quantumMoveOrder: () => 4,
	axis: {
		areQuantumMovesSameAxis,
		simplifySameAxisMoves
	}
};
var cubeMirrorTransforms = {
	"↔ Mirror (M)": {
		replaceMovesByFamily: {
			L: "R",
			R: "L",
			l: "r",
			r: "l",
			Lw: "Rw",
			Rw: "Lw",
			Lv: "Rv",
			Rv: "Lv"
		},
		invertExceptByFamily: /* @__PURE__ */ new Set([
			"x",
			"M",
			"m"
		])
	},
	"⤢ Mirror (S)": {
		replaceMovesByFamily: {
			F: "B",
			B: "F",
			f: "b",
			b: "f",
			Fw: "Bw",
			Bw: "Fw",
			Fv: "Bv",
			Bv: "Fv"
		},
		invertExceptByFamily: /* @__PURE__ */ new Set([
			"z",
			"S",
			"s"
		])
	},
	"↕ Mirror (E)": {
		replaceMovesByFamily: {
			U: "D",
			D: "U",
			u: "d",
			d: "u",
			Uw: "Dw",
			Dw: "Uw",
			Uv: "Dv",
			Dv: "Uv"
		},
		invertExceptByFamily: /* @__PURE__ */ new Set([
			"y",
			"E",
			"e"
		])
	}
};
var cube3x3x3 = {
	id: "3x3x3",
	fullName: "3×3×3 Cube",
	inventedBy: ["Ernő Rubik"],
	inventionYear: 1974,
	kpuzzle: getCached(async () => {
		return experimental3x3x3KPuzzle;
	}),
	svg: getCached(async () => {
		return (await import("./puzzles-dynamic-3x3x3-FYXD7SIU.js")).cube3x3x3SVG;
	}),
	llSVG: getCached(async () => {
		return (await import("./puzzles-dynamic-3x3x3-FYXD7SIU.js")).cube3x3x3LLSVG;
	}),
	llFaceSVG: getCached(async () => {
		return (await import("./puzzles-dynamic-3x3x3-FYXD7SIU.js")).cube3x3x3LLFaceSVG;
	}),
	pg: getCached(async () => {
		return asyncGetPuzzleGeometry("3x3x3");
	}),
	stickeringMask: (stickering) => cubeLikeStickeringMask(cube3x3x3, stickering),
	stickerings: () => cubeLikeStickeringList("3x3x3"),
	puzzleSpecificSimplifyOptions: puzzleSpecificSimplifyOptions333,
	keyMapping: async () => cube3x3x3KeyMapping,
	algTransformData: cubeMirrorTransforms
};
var cube2x2x2 = {
	id: "2x2x2",
	fullName: "2×2×2 Cube",
	kpuzzle: getCached(async () => {
		const kpuzzle = new KPuzzle((await import("./puzzles-dynamic-side-events-IMYJ533P.js")).cube2x2x2JSON);
		kpuzzle.definition.experimentalIsPatternSolved = experimentalIs2x2x2Solved;
		return kpuzzle;
	}),
	svg: async () => (await import("./puzzles-dynamic-side-events-IMYJ533P.js")).cube2x2x2SVG,
	llSVG: getCached(async () => (await import("./puzzles-dynamic-side-events-IMYJ533P.js")).cube2x2x2LLSVG),
	pg: getCached(async () => {
		return asyncGetPuzzleGeometry("2x2x2");
	}),
	stickeringMask: (stickering) => cubeLikeStickeringMask(cube2x2x2, stickering),
	stickerings: () => cubeLikeStickeringList("2x2x2", { use3x3x3Fallbacks: true }),
	algTransformData: cubeMirrorTransforms
};
var cube4x4x4And5x5x5KeyMapping = {
	...cube3x3x3KeyMapping,
	KeyZ: new Move("m'"),
	KeyB: new Move("m"),
	Period: new Move("m'")
};
var cube4x4x4 = new CubePGPuzzleLoader({
	id: "4x4x4",
	fullName: "4×4×4 Cube",
	inventedBy: ["Peter Sebestény"],
	inventionYear: 1981
});
cube4x4x4.llSVG = getCached(async () => {
	return (await import("./puzzles-dynamic-4x4x4-REUXFQJ4.js")).cube4x4x4LLSVG;
});
cube4x4x4.keyMapping = async () => cube4x4x4And5x5x5KeyMapping;
cube4x4x4.kpuzzle = getCached(async () => {
	const kpuzzle = await PGPuzzleLoader.prototype.kpuzzle.call(cube4x4x4);
	kpuzzle.definition.defaultPattern["CENTERS"].pieces = [
		0,
		0,
		0,
		0,
		4,
		4,
		4,
		4,
		8,
		8,
		8,
		8,
		12,
		12,
		12,
		12,
		16,
		16,
		16,
		16,
		20,
		20,
		20,
		20
	];
	const { experimentalIsBigCubeSolved } = await bigCubePuzzleOrientation();
	kpuzzle.definition.experimentalIsPatternSolved = experimentalIsBigCubeSolved;
	return kpuzzle;
});
var cube5x5x5 = new CubePGPuzzleLoader({
	id: "5x5x5",
	fullName: "5×5×5 Cube",
	inventedBy: ["Udo Krell"],
	inventionYear: 1981
});
cube5x5x5.keyMapping = async () => cube4x4x4And5x5x5KeyMapping;
cube5x5x5.kpuzzle = getCached(async () => {
	const kpuzzle = await PGPuzzleLoader.prototype.kpuzzle.call(cube5x5x5);
	const speffzDistinguishableCenters = [
		0,
		0,
		0,
		0,
		4,
		4,
		4,
		4,
		8,
		8,
		8,
		8,
		12,
		12,
		12,
		12,
		16,
		16,
		16,
		16,
		20,
		20,
		20,
		20
	];
	kpuzzle.definition.defaultPattern["CENTERS"].pieces = speffzDistinguishableCenters;
	kpuzzle.definition.defaultPattern["CENTERS2"].pieces = speffzDistinguishableCenters;
	kpuzzle.definition.defaultPattern["CENTERS3"].orientationMod = new Array(6).fill(1);
	const { experimentalIsBigCubeSolved } = await bigCubePuzzleOrientation();
	kpuzzle.definition.experimentalIsPatternSolved = experimentalIsBigCubeSolved;
	return kpuzzle;
});
async function ftoStickering(puzzleLoader, stickering) {
	const kpuzzle = await puzzleLoader.kpuzzle();
	const puzzleStickering = new PuzzleStickering(kpuzzle);
	const m = new StickeringManager(kpuzzle);
	const experimentalFTO_FC = () => m.and([m.move("U"), m.not(m.or(m.moves([
		"F",
		"BL",
		"BR"
	])))]);
	const experimentalFTO_F2T = () => m.and([m.move("U"), m.not(m.move("F"))]);
	const experimentalFTO_SC = () => m.or([experimentalFTO_F2T(), m.and([m.move("F"), m.not(m.or(m.moves([
		"U",
		"BL",
		"BR"
	])))])]);
	const experimentalFTO_L2C = () => m.not(m.or([
		m.and([m.move("U"), m.move("F")]),
		m.and([m.move("F"), m.move("BL")]),
		m.and([m.move("F"), m.move("BR")]),
		m.and([m.move("BL"), m.move("BR")])
	]));
	const experimentalFTO_LBT = () => m.not(m.or([
		m.and([m.move("F"), m.move("BL")]),
		m.and([m.move("F"), m.move("BR")]),
		m.and([m.move("BL"), m.move("BR")])
	]));
	switch (stickering) {
		case "full": break;
		case "experimental-fto-fc":
			puzzleStickering.set(m.not(experimentalFTO_FC()), "Ignored");
			break;
		case "experimental-fto-f2t":
			puzzleStickering.set(m.not(experimentalFTO_F2T()), "Ignored");
			puzzleStickering.set(experimentalFTO_FC(), "Dim");
			break;
		case "experimental-fto-sc":
			puzzleStickering.set(m.not(experimentalFTO_SC()), "Ignored");
			puzzleStickering.set(experimentalFTO_F2T(), "Dim");
			break;
		case "experimental-fto-l2c":
			puzzleStickering.set(m.not(experimentalFTO_L2C()), "Ignored");
			puzzleStickering.set(experimentalFTO_SC(), "Dim");
			break;
		case "experimental-fto-lbt":
			puzzleStickering.set(m.not(experimentalFTO_LBT()), "Ignored");
			puzzleStickering.set(experimentalFTO_L2C(), "Dim");
			break;
		case "experimental-fto-l3t":
			puzzleStickering.set(experimentalFTO_LBT(), "Dim");
			break;
		default:
			console.warn(`Unsupported stickering for ${puzzleLoader.id}: ${stickering}. Setting all pieces to dim.`);
			puzzleStickering.set(m.and(m.moves([])), "Dim");
	}
	return puzzleStickering.toStickeringMask();
}
async function ftoStickerings() {
	return [
		"full",
		"experimental-fto-fc",
		"experimental-fto-f2t",
		"experimental-fto-sc",
		"experimental-fto-l2c",
		"experimental-fto-lbt",
		"experimental-fto-l3t"
	];
}
var ftoKeyMapping = {
	KeyI: new Move("R"),
	KeyK: new Move("R'"),
	KeyW: new Move("B"),
	KeyO: new Move("B'"),
	KeyS: new Move("D"),
	KeyL: new Move("D'"),
	KeyD: new Move("L"),
	KeyE: new Move("L'"),
	KeyJ: new Move("U"),
	KeyF: new Move("U'"),
	KeyH: new Move("F"),
	KeyG: new Move("F'"),
	KeyN: new Move("Rv'"),
	KeyC: new Move("l"),
	KeyR: new Move("l'"),
	KeyU: new Move("r"),
	KeyM: new Move("r'"),
	KeyX: new Move("d"),
	Comma: new Move("d'"),
	KeyT: new Move("Lv'"),
	KeyY: new Move("Rv"),
	KeyV: new Move("Lv"),
	Semicolon: new Move("Uv"),
	KeyA: new Move("Uv'"),
	KeyP: new Move("BR'"),
	KeyQ: new Move("BL"),
	KeyZ: new Move("BL'"),
	KeyB: new Move("T"),
	Period: new Move("BR"),
	Backquote: new Pause()
};
var BabyFTOPuzzleLoader = class extends PGPuzzleLoader {
	constructor() {
		super({
			pgID: "skewb diamond",
			id: "baby_fto",
			fullName: "Baby FTO",
			inventedBy: ["Uwe Mèffert"],
			setOrientationModTo1ForPiecesOfOrbits: ["CENTERS"]
		});
	}
	stickeringMask(stickering) {
		return ftoStickering(this, stickering);
	}
	svg = getCached(async () => {
		return (await import("./puzzles-dynamic-unofficial-P3TW433I.js")).babyFTOSVG;
	});
	keyMapping = async () => ftoKeyMapping;
};
var baby_fto = new BabyFTOPuzzleLoader();
var clock = {
	id: "clock",
	fullName: "Clock",
	inventedBy: ["Christopher C. Wiggs", "Christopher J. Taylor"],
	inventionYear: 1988,
	kpuzzle: getCached(async () => new KPuzzle((await import("./puzzles-dynamic-side-events-IMYJ533P.js")).clockJSON)),
	svg: getCached(async () => {
		return (await import("./puzzles-dynamic-side-events-IMYJ533P.js")).clockSVG;
	})
};
var FTOPuzzleLoader = class extends PGPuzzleLoader {
	constructor() {
		super({
			pgID: "FTO",
			id: "fto",
			fullName: "Face-Turning Octahedron",
			inventedBy: ["Karl Rohrbach", "David Pitcher"],
			inventionYear: 1983
		});
	}
	stickeringMask(stickering) {
		return ftoStickering(this, stickering);
	}
	stickerings = ftoStickerings;
	svg = getCached(async () => {
		return (await import("./puzzles-dynamic-unofficial-P3TW433I.js")).ftoSVG;
	});
	keyMapping = async () => ftoKeyMapping;
	algTransformData = { "↔ Mirror (x)": {
		replaceMovesByFamily: {
			L: "R",
			R: "L",
			l: "r",
			r: "l",
			Lw: "Rw",
			Rw: "Lw",
			Lv: "Rv",
			Rv: "Lv",
			BL: "BR",
			BR: "BL",
			bl: "br",
			br: "bl",
			BLw: "BRw",
			BRw: "BLw",
			BLv: "BRv",
			BRv: "BLv"
		},
		invertExceptByFamily: /* @__PURE__ */ new Set(["x"])
	} };
};
var fto = new FTOPuzzleLoader();
var KILOMINX_PUZZLE_DESCRIPTION = "d f 0.56";
var kilominx = {
	id: "kilominx",
	fullName: "Kilominx",
	kpuzzle: getCached(() => asyncGetKPuzzleByDesc(KILOMINX_PUZZLE_DESCRIPTION, {
		includeCenterOrbits: false,
		includeEdgeOrbits: false
	})),
	pg: () => descAsyncGetPuzzleGeometry(KILOMINX_PUZZLE_DESCRIPTION, {
		includeCenterOrbits: false,
		includeEdgeOrbits: false
	}),
	svg: getCached(async () => {
		return (await import("./puzzles-dynamic-unofficial-P3TW433I.js")).kilominxSVG;
	})
};
var loopover = {
	id: "loopover",
	fullName: "Loopover",
	inventedBy: ["Cary Huang"],
	inventionYear: 2018,
	kpuzzle: getCached(async () => new KPuzzle((await import("./puzzles-dynamic-unofficial-P3TW433I.js")).loopoverJSON)),
	svg: async () => {
		return (await import("./puzzles-dynamic-unofficial-P3TW433I.js")).loopoverSVG;
	}
};
async function megaminxStickeringMask(puzzleLoader, stickering) {
	if ((await megaminxStickerings()).includes(stickering)) return cubeLikeStickeringMask(puzzleLoader, stickering);
	console.warn(`Unsupported stickering for ${puzzleLoader.id}: ${stickering}. Setting all pieces to dim.`);
	return cubeLikeStickeringMask(puzzleLoader, "full");
}
var megaminxStickeringListPromise = from(() => cubeLikeStickeringList("megaminx"));
function megaminxStickerings() {
	return megaminxStickeringListPromise;
}
var megaminxKeyMapping = {
	KeyI: new Move("R"),
	KeyK: new Move("R'"),
	KeyW: new Move("B"),
	KeyO: new Move("B'"),
	KeyS: new Move("FR"),
	KeyL: new Move("FR'"),
	KeyD: new Move("L"),
	KeyE: new Move("L'"),
	KeyJ: new Move("U"),
	KeyF: new Move("U'"),
	KeyH: new Move("F"),
	KeyG: new Move("F'"),
	KeyC: new Move("Lw"),
	KeyR: new Move("Lw'"),
	KeyU: new Move("Rw"),
	KeyM: new Move("Rw'"),
	KeyX: new Move("d"),
	Comma: new Move("d'"),
	KeyT: new Move("Rv"),
	KeyY: new Move("Rv"),
	KeyV: new Move("Rv'"),
	KeyN: new Move("Rv'"),
	Semicolon: new Move("y"),
	KeyA: new Move("y'"),
	KeyP: new Move("z"),
	KeyQ: new Move("z'"),
	KeyZ: new Move("2L'"),
	KeyB: new Move("2R"),
	Period: new Move("2R'"),
	Backquote: new Pause()
};
var MegaminxPuzzleLoader = class extends PGPuzzleLoader {
	constructor() {
		super({
			id: "megaminx",
			fullName: "Megaminx",
			inventionYear: 1981
		});
	}
	stickeringMask(stickering) {
		return megaminxStickeringMask(this, stickering);
	}
	stickerings = megaminxStickerings;
	llSVG = getCached(async () => {
		return (await import("./puzzles-dynamic-megaminx-2LVHIDL4.js")).megaminxLLSVG;
	});
	keyMapping = async () => megaminxKeyMapping;
};
var megaminx = new MegaminxPuzzleLoader();
var melindas2x2x2x2 = {
	id: "melindas2x2x2x2",
	fullName: "Melinda's 2×2×2×2",
	inventedBy: ["Melinda Green"],
	kpuzzle: getCached(async () => new KPuzzle((await import("./puzzles-dynamic-side-events-IMYJ533P.js")).melindas2x2x2x2OrbitJSON)),
	svg: getCached(async () => {
		return (await import("./puzzles-dynamic-side-events-IMYJ533P.js")).melindas2x2x2x2OrbitSVG;
	})
};
var PyraminxPuzzleLoader = class extends PGPuzzleLoader {
	constructor() {
		super({
			id: "pyraminx",
			fullName: "Pyraminx",
			inventedBy: ["Uwe Meffert"]
		});
	}
	svg = getCached(async () => {
		return (await import("./puzzles-dynamic-side-events-IMYJ533P.js")).pyraminxSVG;
	});
	algTransformData = { "↔ Mirror (x)": {
		replaceMovesByFamily: {
			L: "R",
			R: "L",
			l: "r",
			r: "l",
			Lw: "Rw",
			Rw: "Lw",
			Lv: "Rv",
			Rv: "Lv"
		},
		invertExceptByFamily: /* @__PURE__ */ new Set([])
	} };
};
var pyraminx = new PyraminxPuzzleLoader();
var rediCube = {
	id: "redi_cube",
	fullName: "Redi Cube",
	inventedBy: ["Oskar van Deventer"],
	inventionYear: 2009,
	kpuzzle: getCached(async () => new KPuzzle((await import("./puzzles-dynamic-unofficial-P3TW433I.js")).rediCubeJSON)),
	svg: async () => {
		return (await import("./puzzles-dynamic-unofficial-P3TW433I.js")).rediCubeSVG;
	}
};
var square1 = {
	id: "square1",
	fullName: "Square-1",
	inventedBy: ["Karel Hršel", "Vojtech Kopský"],
	inventionYear: 1990,
	kpuzzle: getCached(async () => new KPuzzle((await import("./puzzles-dynamic-side-events-IMYJ533P.js")).sq1HyperOrbitJSON)),
	svg: getCached(async () => {
		return (await import("./puzzles-dynamic-side-events-IMYJ533P.js")).sq1HyperOrbitSVG;
	})
};
var tri_quad = {
	id: "tri_quad",
	fullName: "TriQuad",
	inventedBy: ["Bram Cohen", "Carl Hoff"],
	inventionYear: 2018,
	kpuzzle: getCached(async () => new KPuzzle((await import("./puzzles-dynamic-side-events-IMYJ533P.js")).triQuadJSON)),
	svg: getCached(async () => {
		return (await import("./puzzles-dynamic-side-events-IMYJ533P.js")).triQuadSVG;
	})
};
var puzzles = {
	/******** Start of WCA Puzzles *******/
	"3x3x3": cube3x3x3,
	"2x2x2": cube2x2x2,
	"4x4x4": cube4x4x4,
	"5x5x5": cube5x5x5,
	"6x6x6": new CubePGPuzzleLoader({
		id: "6x6x6",
		fullName: "6×6×6 Cube"
	}),
	"7x7x7": new CubePGPuzzleLoader({
		id: "7x7x7",
		fullName: "7×7×7 Cube"
	}),
	"40x40x40": new CubePGPuzzleLoader({
		id: "40x40x40",
		fullName: "40×40×40 Cube"
	}),
	clock,
	megaminx,
	pyraminx,
	skewb: new PGPuzzleLoader({
		id: "skewb",
		fullName: "Skewb",
		inventedBy: ["Tony Durham"]
	}),
	square1,
	/******** End of WCA puzzles ********/
	fto,
	gigaminx: new PGPuzzleLoader({
		id: "gigaminx",
		fullName: "Gigaminx",
		inventedBy: ["Tyler Fox"],
		inventionYear: 2006
	}),
	master_tetraminx: new PGPuzzleLoader({
		pgID: "master tetraminx",
		id: "master_tetraminx",
		fullName: "Master Tetraminx",
		inventedBy: ["Katsuhiko Okamoto"],
		inventionYear: 2002
	}),
	kilominx,
	redi_cube: rediCube,
	melindas2x2x2x2,
	loopover,
	tri_quad,
	baby_fto
};
//#endregion
export { KPuzzle as a, KPattern as i, puzzles as n, from as r, cube2x2x2 as t };
