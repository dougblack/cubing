// Lightweight audio cues for the timer.
//
// - beep(): synthesized sine via Web Audio API. AudioContext is lazily
//   created on the first call (which is from a user gesture — the
//   spacebar press that starts inspection — satisfying browser autoplay
//   policies).
// - speak(): SpeechSynthesis utterance for the inspection countdown.
//
// Both are no-ops when the browser doesn't support them (SSR or older
// browsers); the timer state machine doesn't depend on audio firing.

import { browser } from "$app/environment";

let cachedContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (!browser) return null;
  if (cachedContext) return cachedContext;
  const Ctor =
    typeof window.AudioContext !== "undefined"
      ? window.AudioContext
      : (window as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
  if (!Ctor) return null;
  try {
    cachedContext = new Ctor();
    return cachedContext;
  } catch {
    return null;
  }
}

export interface BeepOptions {
  /** Frequency in Hz. Keep mid-range — 350-450 reads as "ready" without
   *  being shrill. Default 400. */
  frequency?: number;
  /** Duration in ms. Default 120. */
  durationMs?: number;
  /** Peak gain, 0..1. Default 0.25 — audible without overpowering. */
  volume?: number;
}

export function beep(opts: BeepOptions = {}): void {
  const ctx = getContext();
  if (!ctx) return;
  const freq = opts.frequency ?? 400;
  const duration = (opts.durationMs ?? 120) / 1000;
  const volume = opts.volume ?? 0.25;

  // A short attack + release envelope avoids click artifacts at start/end.
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  const now = ctx.currentTime;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.01);
  gain.gain.linearRampToValueAtTime(0, now + duration);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + duration);
}

export function speak(text: string): void {
  if (!browser) return;
  const synth = window.speechSynthesis;
  if (!synth) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1.5;
  utterance.volume = 1;
  synth.speak(utterance);
}

/** Stop any in-progress or queued utterance. Call when the timer leaves
 *  inspection so a queued "two" doesn't blurt out after the solve has
 *  already started. */
export function cancelSpeech(): void {
  if (!browser) return;
  window.speechSynthesis?.cancel();
}
