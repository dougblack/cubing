import { t as Alg } from "./chunk-O6HEZXGY.js";
import { t as PortableWorker, u as wrap } from "./chunk-V27EM5TJ.js";
import { t as exposeAPI } from "./chunk-7GUL3OBQ.js";
//#region ../core/node_modules/cubing/dist/lib/cubing/chunks/chunk-M7YKTETT.js
function searchWorkerURLImportMetaResolve() {
	return import.meta.resolve("./search-worker-entry.js");
}
function searchWorkerURLNewURLImportMetaURL() {
	return new URL("./search-worker-entry.js", import.meta.url);
}
async function searchWorkerURLEsbuildWorkaround() {
	exposeAPI.expose = false;
	return (await import("./search-worker-entry.js")).WORKER_ENTRY_FILE_URL;
}
function wrapAPI(worker) {
	return wrap(worker);
}
async function instantiateModuleWorker(workerEntryFileURL) {
	return new Promise(async (resolve, reject) => {
		try {
			const worker = new PortableWorker(workerEntryFileURL);
			const onFirstMessage = (messageData) => {
				if (messageData === "comlink-exposed") resolve(wrapAPI(worker));
				else reject(/* @__PURE__ */ new Error(`wrong module instantiation message ${messageData}`));
			};
			const onError = (e) => {
				reject(e);
			};
			if ("once" in worker) worker.once("message", onFirstMessage);
			else {
				worker.addEventListener("error", onError, { once: true });
				worker.addEventListener("message", (e) => onFirstMessage(e.data), { once: true });
			}
		} catch (e) {
			reject(e);
		}
	});
}
var allWorkerAPIPromises = [];
async function instantiateWorkerAPI() {
	const workerAPIPromise = instantiateWorkerImplementation();
	allWorkerAPIPromises.push(workerAPIPromise);
	const insideAPI = await workerAPIPromise;
	insideAPI.setDebugMeasurePerf(searchOutsideDebugGlobals.logPerf);
	insideAPI.setScramblePrefetchLevel(searchOutsideDebugGlobals.scramblePrefetchLevel);
	return workerAPIPromise;
}
async function instantiateWorkerImplementation() {
	if (globalThis.location?.protocol === "file:") console.warn("This current web page is loaded from the local filesystem (a URL that starts with `file://`). In this situation, `cubing.js` may be unable to generate scrambles or perform searches in some browsers. See: https://js.cubing.net/cubing/scramble/#file-server-required");
	function failed(methodDescription) {
		return `Module worker instantiation${methodDescription ? ` ${methodDescription}` : ""} failed`;
	}
	const importMetaResolveStrategy = [
		async () => instantiateModuleWorker(searchWorkerURLImportMetaResolve()),
		"using `import.meta.resolve(…)",
		null
	];
	const esbuildWorkaroundStrategy = [
		async () => instantiateModuleWorker(await searchWorkerURLEsbuildWorkaround()),
		"using the `esbuild` workaround",
		null
	];
	const newURLStrategy = [
		async () => instantiateModuleWorker(searchWorkerURLNewURLImportMetaURL()),
		"using `new URL(…, import.meta.url)`",
		"will"
	];
	const fallbackOrder = searchOutsideDebugGlobals.prioritizeEsbuildWorkaroundForWorkerInstantiation ? [
		esbuildWorkaroundStrategy,
		importMetaResolveStrategy,
		newURLStrategy
	] : [
		importMetaResolveStrategy,
		esbuildWorkaroundStrategy,
		newURLStrategy
	];
	for (const [fn, description, warnOnSuccess] of fallbackOrder) try {
		const worker = await fn();
		if (warnOnSuccess) {
			if (searchOutsideDebugGlobals.showWorkerInstantiationWarnings) console.warn(`Module worker instantiation required ${description}. \`cubing.js\` ${warnOnSuccess} not support this fallback in the future.`);
		}
		return worker;
	} catch {}
	throw new Error(`${failed()}. There are no more fallbacks available.`);
}
var cachedWorkerInstance;
function getCachedWorkerInstance() {
	return cachedWorkerInstance ??= instantiateWorkerAPI();
}
async function randomScrambleForEvent(eventID) {
	const scrambleString = await (searchOutsideDebugGlobals.forceNewWorkerForEveryScramble ? await instantiateWorkerAPI() : await getCachedWorkerInstance()).randomScrambleStringForEvent(eventID);
	return Alg.fromString(scrambleString);
}
var searchOutsideDebugGlobals = {
	logPerf: true,
	scramblePrefetchLevel: "auto",
	forceNewWorkerForEveryScramble: false,
	showWorkerInstantiationWarnings: true,
	prioritizeEsbuildWorkaroundForWorkerInstantiation: false,
	allowDerivedScrambles: false
};
//#endregion
export { randomScrambleForEvent as t };
