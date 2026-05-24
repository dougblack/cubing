<script lang="ts">
  import {
    collapseDoubleTurns,
    remapAlg,
    simplifyMoves,
  } from "@cubing/core";
  import { page } from "$app/state";
  import CubeView from "$lib/CubeView.svelte";
  import OrientationPicker from "$lib/OrientationPicker.svelte";
  import { orientationPref } from "$lib/orientation-pref.svelte";

  // Accepts three optional query params:
  //   - facelets:  54-char Kociemba string (e.g. from a BT debug log line)
  //   - scramble:  algorithm string applied to a solved cube first
  //   - alg:       algorithm string applied after the scramble
  // The cube renders the state these produce. Drag to rotate; double-click
  // to reset the angle.

  const facelets = $derived(page.url.searchParams.get("facelets") ?? undefined);
  const scramble = $derived(page.url.searchParams.get("scramble") ?? undefined);
  const alg = $derived(page.url.searchParams.get("alg") ?? undefined);

  const hasInput = $derived(!!(facelets || scramble || alg));

  /** Translate a raw URL-passed alg into the user's frame, then collapse
   *  same-face quarter-turn pairs into half turns for display. Reactive
   *  to orientation preference changes via the read inside. */
  function displayAlg(raw: string): string {
    const translated = remapAlg(raw, orientationPref.faceRemap());
    return collapseDoubleTurns(
      translated.split(/\s+/).filter(Boolean),
    ).join(" ");
  }

  /** Same as `displayAlg` but additionally cancels redundant turns within
   *  each same-face run (`F F' F → F`, `R R R R → empty`). For the
   *  scramble where hesitation/correction shouldn't show up in the
   *  canonical setup string. */
  function displayScramble(raw: string): string {
    const translated = remapAlg(raw, orientationPref.faceRemap());
    return simplifyMoves(translated.split(/\s+/).filter(Boolean)).join(" ");
  }
</script>

<svelte:head>
  <title>Cube view — cubing</title>
</svelte:head>

<section class="cube-page">
  <div class="orient-row">
    <OrientationPicker />
  </div>
  <div class="cube-stage">
    <CubeView {facelets} {scramble} {alg} size={240} />
  </div>

  <div class="cube-meta">
    {#if !hasInput}
      <p class="hint">
        Showing a solved cube — pass <code>?scramble=…</code>,
        <code>?alg=…</code>, or <code>?facelets=…</code> in the URL.
      </p>
    {/if}
    {#if scramble}
      <div class="meta-row">
        <span class="meta-label">scramble</span>
        <code class="meta-value">{displayScramble(scramble)}</code>
      </div>
    {/if}
    {#if alg}
      <div class="meta-row">
        <span class="meta-label">moves</span>
        <code class="meta-value">{displayAlg(alg)}</code>
      </div>
    {/if}
    {#if facelets}
      <div class="meta-row">
        <span class="meta-label">facelets</span>
        <code class="meta-value">{facelets}</code>
      </div>
    {/if}
  </div>
</section>

<style>
  .cube-page {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 32px;
    padding: 24px 16px;
  }
  .orient-row {
    align-self: stretch;
    display: flex;
    justify-content: flex-end;
    margin-bottom: -16px;
  }
  .cube-stage {
    display: flex;
    justify-content: center;
    /* CSS 3D rotations can spill faces past the viewport's bounding box,
     * especially when the cube is pulled down toward the viewer. Reserve
     * extra vertical space so it never bleeds into the metadata below. */
    padding: 60px 60px 80px;
  }
  .cube-meta {
    max-width: 720px;
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .meta-row {
    display: grid;
    grid-template-columns: 80px 1fr;
    gap: 12px;
    align-items: baseline;
  }
  .meta-label {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--color-text-muted);
  }
  .meta-value {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--color-text);
    word-break: break-all;
    line-height: 1.5;
  }
  .hint {
    margin: 0;
    color: var(--color-text-muted);
    font-size: 13px;
    text-align: center;
  }
  .hint code {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--color-text);
  }
</style>
