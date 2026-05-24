import { a as Grouping, t as Alg } from "./chunk-O6HEZXGY.js";
//#region ../core/node_modules/cubing/dist/lib/cubing/chunks/big-puzzle-orientation-ZVZQJEF5.js
function puzzleOrientationBigCubeIdx(pattern) {
	return [pattern.patternData["CORNERS"].pieces[0], pattern.patternData["CORNERS"].orientation[0]];
}
var puzzleOrientationBigCubeCacheRaw = new Array(8).fill(0).map(() => {
	return new Array(3);
});
var puzzleOrientationBigCubeCacheInitialized = false;
function puzzleOrientationBigCubeCache(bigCubeKPuzzle) {
	if (!puzzleOrientationBigCubeCacheInitialized) {
		const uAlgs = [
			"",
			"y",
			"y2",
			"y'",
			"x2",
			"x2 y",
			"x2 y2",
			"x2 y'"
		].map((s) => Alg.fromString(s));
		const UFRAlg = new Alg("Rv Uv");
		for (const uAlg of uAlgs) {
			let transformation = bigCubeKPuzzle.algToTransformation(uAlg);
			for (let i = 0; i < 4; i++) {
				const [idxUFR, oriUFR] = puzzleOrientationBigCubeIdx(transformation.toKPattern());
				puzzleOrientationBigCubeCacheRaw[idxUFR][oriUFR] = new Alg([...uAlg.childAlgNodes(), new Grouping(UFRAlg, i)]).invert();
				if (i === 3) break;
				transformation = transformation.applyAlg(UFRAlg);
			}
		}
	}
	return puzzleOrientationBigCubeCacheRaw;
}
function normalizeBigCubeOrientation(pattern) {
	const [idxUFR, oriUFR] = puzzleOrientationBigCubeIdx(pattern);
	const orientationAlg = puzzleOrientationBigCubeCache(pattern.kpuzzle)[idxUFR][oriUFR];
	return pattern.applyAlg(orientationAlg);
}
function experimentalIsBigCubeSolved(pattern, options) {
	if (options.ignorePuzzleOrientation) pattern = normalizeBigCubeOrientation(pattern);
	return pattern.isIdentical(pattern.kpuzzle.defaultPattern());
}
//#endregion
export { experimentalIsBigCubeSolved, normalizeBigCubeOrientation, puzzleOrientationBigCubeCache, puzzleOrientationBigCubeIdx };
