// Shared identifiers and small enums. Kept separate from `entities.ts` so
// they can be imported without pulling in the entity types.

export type StageSlug = "cross" | "f2l" | "oll" | "pll";

/** A move with notation as a string. Wraps cubing/alg parsing in places where
 *  we want a typed value but don't need the full Alg machinery. */
export type MoveString = string;
