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
//   - ORIENTATION       orientation.ts (face/color enums + the cube↔user
//                                       frame remap for translating BT
//                                       moves into the cuber's preferred
//                                       view)
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
export * from "./trainer.js";

// Orientation: face enum + colors and the cube↔user frame remap.
export type { CubeColor, CubeFace } from "./orientation.js";
export {
  buildFaceRemap,
  COLOR_OPPOSITE,
  CUBE_COLORS,
  CUBE_FACES,
  isIdentityRemap,
  remapAlg,
  remapMove,
  validFrontColors,
} from "./orientation.js";
