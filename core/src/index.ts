// Public surface of @cubing/core.
//
// Library shape (sections roughly mirror the source files):
//
//   - DATA TYPES        entities.ts, types.ts
//   - CUBE SIMULATOR    cube.ts
//   - SCRAMBLE          scramble.ts
//   - SCRAMBLE TRACKER  scramble-tracker.ts
//   - STATS             stats.ts
//   - PHASE DETECTION   phases.ts
//   - CASE RECOGNITION  recognition.ts
//   - ORIENTATION       orientation.ts (only the cube-face type + list;
//                                       the rotation algorithm is kept
//                                       in the file for future color-
//                                       neutral recognition work)
//
// `cubing/alg` is the only JS-specific runtime dependency, and it's
// isolated to scramble.ts and cube.ts (alg parsing). Everything else is
// pure-data / pure-logic and translates straightforwardly to Swift.

export * from "./types.js";
export * from "./entities.js";
export * from "./cube.js";
export * from "./scramble.js";
export * from "./scramble-tracker.js";
export * from "./stats.js";
export * from "./phases.js";
export * from "./recognition.js";

// Orientation: only the face enum + list are part of the public surface.
// The rotation-remap algorithm stays in the file (well-tested, useful
// for the color-neutral recognition follow-up) but isn't re-exported.
export type { CubeFace } from "./orientation.js";
export { CUBE_FACES } from "./orientation.js";
