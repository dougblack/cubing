// Shape of the per-stage JSON dataset under data/methods/cfop/*.json.
// Mirrors data/schema/algorithm.schema.json. Only the fields the UI consumes
// are declared; extra source-tracking fields are tolerated by the loader.

export type StagePopularity = "primary" | "common" | "alternative";

export interface Algorithm {
  moves: string;
  popularity?: StagePopularity;
  popularity_rank?: number;
  popularity_source?: string;
  length_htm?: number;
  source_urls?: string[];
  jperm_recommended?: boolean;
  scdb_standard?: boolean;
  community_votes?: number | null;
  notes?: string;
}

export interface Case {
  id: string;
  name: string;
  aliases?: string[];
  number?: number;
  group?: string;
  jperm_group?: string;
  probability_weight?: number;
  tags?: string[];
  algorithms: Algorithm[];
}

export interface StageFile {
  method: string;
  stage: string;
  stage_name: string;
  puzzle: string;
  notation: string;
  description: string;
  cases: Case[];
}

export type StageSlug = "pll" | "oll" | "2loll" | "f2l";

export interface StageMeta {
  slug: StageSlug;
  shortName: string;
  fullName: string;
  description: string;
}
