<script lang="ts">
  // Subtle, always-visible orientation indicator. Renders as one line of
  // small muted text — "view: Y top, G front" — with click-to-expand
  // dropdowns for changing the preference. Apply on any page that
  // displays user-input moves or rendered cube state.

  import {
    COLOR_OPPOSITE,
    CUBE_COLORS,
    type CubeColor,
    validFrontColors,
  } from "@cubing/core";
  import { orientationPref } from "./orientation-pref.svelte";

  let open = $state(false);

  function onTopChange(e: Event) {
    const newTop = (e.currentTarget as HTMLSelectElement).value as CubeColor;
    // Pick a valid front (current one if still valid, else the first option).
    const valids = validFrontColors(newTop);
    const newFront = valids.includes(orientationPref.front)
      ? orientationPref.front
      : (valids[0] as CubeColor);
    orientationPref.set(newTop, newFront);
  }
  function onFrontChange(e: Event) {
    const newFront = (e.currentTarget as HTMLSelectElement).value as CubeColor;
    orientationPref.set(orientationPref.top, newFront);
  }
  function onScrambleFrameChange(e: Event) {
    const on = (e.currentTarget as HTMLInputElement).checked;
    orientationPref.setScrambleInUserFrame(on);
  }

  const COLOR_NAME: Record<CubeColor, string> = {
    Y: "yellow",
    W: "white",
    G: "green",
    B: "blue",
    O: "orange",
    R: "red",
  };
  const COLOR_LETTER: Record<CubeColor, string> = {
    Y: "Y",
    W: "W",
    G: "G",
    B: "B",
    O: "O",
    R: "R",
  };

  const validFronts = $derived(validFrontColors(orientationPref.top));
</script>

<div class="picker">
  <button
    class="summary"
    title="Click to change preferred cube orientation"
    onclick={() => (open = !open)}
  >
    view: {COLOR_LETTER[orientationPref.top]} top, {COLOR_LETTER[
      orientationPref.front
    ]} front
    <span class="caret" class:open>▾</span>
  </button>
  {#if open}
    <div class="controls" role="group" aria-label="Cube orientation">
      <label>
        <span>top</span>
        <select value={orientationPref.top} onchange={onTopChange}>
          {#each CUBE_COLORS as c (c)}
            <option value={c}>{COLOR_NAME[c]}</option>
          {/each}
        </select>
      </label>
      <label>
        <span>front</span>
        <select value={orientationPref.front} onchange={onFrontChange}>
          {#each CUBE_COLORS as c (c)}
            <option value={c} disabled={!validFronts.includes(c)}>
              {COLOR_NAME[c]}
              {#if COLOR_OPPOSITE[orientationPref.top] === c}(opposite of top){/if}
              {#if c === orientationPref.top}(same as top){/if}
            </option>
          {/each}
        </select>
      </label>
    </div>
    <label
      class="scramble-frame"
      title="On: scrambles are shown in this orientation, so you never have to flip the cube. Off: scrambles are in WCA-canonical W-top/G-front frame."
    >
      <input
        type="checkbox"
        checked={orientationPref.scrambleInUserFrame}
        onchange={onScrambleFrameChange}
      />
      <span>scramble in this orientation</span>
    </label>
  {/if}
</div>

<style>
  .picker {
    display: inline-flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    font-size: 11px;
    color: var(--color-text-muted);
  }
  .summary {
    font: inherit;
    color: inherit;
    background: transparent;
    border: none;
    padding: 0;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .summary:hover {
    color: var(--color-text);
  }
  .caret {
    display: inline-block;
    transition: transform 0.12s ease;
  }
  .caret.open {
    transform: rotate(180deg);
  }
  .controls {
    display: inline-flex;
    align-items: center;
    gap: 12px;
  }
  .controls label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .controls span {
    color: var(--color-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .controls select {
    font: inherit;
    font-size: 11px;
    padding: 2px 4px;
    border: 1px solid var(--color-border);
    border-radius: 3px;
    background: var(--color-surface);
    color: var(--color-text);
    cursor: pointer;
  }
  .scramble-frame {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    text-transform: none;
    letter-spacing: normal;
  }
  .scramble-frame input {
    margin: 0;
    cursor: pointer;
  }
</style>
