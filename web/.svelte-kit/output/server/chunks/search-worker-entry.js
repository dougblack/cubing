import { t as exposeAPI } from "./chunk-7GUL3OBQ.js";
//#region ../core/node_modules/cubing/dist/lib/cubing/chunks/search-worker-entry.js
if (exposeAPI.expose) {
	await import("./inside-Q56GLXG4.js");
	if (globalThis.postMessage) globalThis.postMessage("comlink-exposed");
	else globalThis.process.getBuiltinModule("node:worker_threads").parentPort?.postMessage("comlink-exposed");
}
var WORKER_ENTRY_FILE_URL = import.meta.url;
//#endregion
export { WORKER_ENTRY_FILE_URL };
