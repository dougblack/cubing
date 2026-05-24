import type { AverageResult } from "@cubing/core";

/** Format raw milliseconds as a cubing-style time string: SS.cc under a
 *  minute, M:SS.cc above. Centisecond precision throughout. */
export function formatMs(ms: number): string {
  const totalSec = ms / 1000;
  if (totalSec < 60) return totalSec.toFixed(2);
  const m = Math.floor(totalSec / 60);
  const s = (totalSec - m * 60).toFixed(2).padStart(5, "0");
  return `${m}:${s}`;
}

/** Format the result of an averageOfN / bestSingleMs call. */
export function formatAverage(v: AverageResult): string {
  if (v === null) return "—";
  if (v === "DNF") return "DNF";
  return formatMs(v);
}

/** Compact human-friendly date+time, e.g. "May 23, 2:32 PM". Used for showing
 *  when sessions began. */
export function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}
