// WCA-legal scramble generation. Thin wrapper around cubing/scramble so the
// rest of the app doesn't have to know which cubing.js subpath produces them.

import { randomScrambleForEvent } from "cubing/scramble";

/** Generate a single WCA-legal 3x3 scramble. */
export async function next3x3Scramble(): Promise<string> {
  const alg = await randomScrambleForEvent("333");
  return alg.toString();
}
