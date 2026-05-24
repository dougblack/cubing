<script lang="ts">
  import {
    applyAlg,
    parseKociembaFacelets,
    remapAlg,
    solved,
    type State,
    type StickerColor,
  } from "@cubing/core";
  import { orientationPref } from "./orientation-pref.svelte";

  // A small interactive 3D cube view. Two input modes:
  //   1. `facelets` — a 54-char Kociemba string (e.g. from the BT log).
  //   2. `alg` (optionally combined with `scramble`) — apply to a solved
  //      cube and show the result.
  //
  // Both inputs are optional. With neither, renders a solved cube.
  //
  // Implementation: CSS 3D transforms over our 54-sticker simulator. No
  // WebGL or external 3D library. Click-and-drag rotates the cube; pinch /
  // touch-drag on mobile. Double-click resets the angle.

  interface Props {
    facelets?: string;
    alg?: string;
    scramble?: string;
    size?: number;
    /** Initial yaw (rotation around vertical axis), in degrees. */
    initialYaw?: number;
    /** Initial pitch (rotation around horizontal axis), in degrees. */
    initialPitch?: number;
  }

  let {
    facelets,
    alg,
    scramble,
    size = 200,
    initialYaw = -30,
    initialPitch = -25,
  }: Props = $props();

  const COLOR_HEX: Record<StickerColor, string> = {
    Y: "#FFD500",
    W: "#FFFFFF",
    G: "#009E60",
    B: "#0051BA",
    O: "#FF5800",
    R: "#C41E3A",
  };

  // Named `cubeState` rather than `state` to avoid shadowing the `$state`
  // rune (Svelte's compiler interprets `$state` as auto-subscription to a
  // store named `state` when such a variable is in scope).
  //
  // Pipeline: scramble + alg come in as CUBE-FRAME strings (WCA scrambles
  // and raw BT-reported moves are both in the cube's factory W-top/G-front
  // frame). We translate them into the cuber's preferred frame BEFORE
  // applying to the sim — that way the resulting sim state matches the
  // cuber's physical cube, with their cross color naturally on D. Then
  // `orient` may still apply a small adjustment if the cross sits
  // elsewhere (e.g. user changed preference mid-state, partial cross).
  const cubeState = $derived.by<State>(() => {
    try {
      let s: State;
      if (facelets) {
        // Facelets strings come in cube frame too; parse then orient.
        s = parseKociembaFacelets(facelets);
      } else {
        const remap = orientationPref.faceRemap();
        const sc = scramble?.trim() ? remapAlg(scramble, remap) : "";
        const al = alg?.trim() ? remapAlg(alg, remap) : "";
        s = solved();
        if (sc) s = applyAlg(s, sc);
        if (al) s = applyAlg(s, al);
      }
      return orientationPref.orient(s);
    } catch {
      // Bad input — show solved rather than crashing the row.
      return orientationPref.orient(solved());
    }
  });

  // 6 faces with their CSS transforms. The translateZ moves each face out
  // from the cube center to the surface; the rotations orient them.
  const FACES: ReadonlyArray<{ name: string; faceIdx: number; transform: string }> = [
    { name: "U", faceIdx: 0, transform: "rotateX(90deg) translateZ(var(--cube-half))" },
    { name: "L", faceIdx: 1, transform: "rotateY(-90deg) translateZ(var(--cube-half))" },
    { name: "F", faceIdx: 2, transform: "translateZ(var(--cube-half))" },
    { name: "R", faceIdx: 3, transform: "rotateY(90deg) translateZ(var(--cube-half))" },
    { name: "B", faceIdx: 4, transform: "rotateY(180deg) translateZ(var(--cube-half))" },
    { name: "D", faceIdx: 5, transform: "rotateX(-90deg) translateZ(var(--cube-half))" },
  ];

  // Mouse / touch rotation state. The `initial*` props are deliberate
  // one-time seeds — after the first render the user controls them by
  // dragging. Suppress the "only captures initial value" warning since
  // that's the intent.
  // svelte-ignore state_referenced_locally
  const seedYaw = initialYaw;
  // svelte-ignore state_referenced_locally
  const seedPitch = initialPitch;
  let yaw = $state(seedYaw);
  let pitch = $state(seedPitch);
  let dragging = false;
  let lastX = 0;
  let lastY = 0;

  function onPointerDown(e: PointerEvent) {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: PointerEvent) {
    if (!dragging) return;
    yaw += (e.clientX - lastX) * 0.5;
    pitch -= (e.clientY - lastY) * 0.5;
    // Clamp pitch so the cube doesn't flip upside-down (still reachable
    // since you can spin past it via yaw).
    pitch = Math.max(-80, Math.min(80, pitch));
    lastX = e.clientX;
    lastY = e.clientY;
  }
  function onPointerUp(e: PointerEvent) {
    dragging = false;
    try {
      (e.currentTarget as Element).releasePointerCapture(e.pointerId);
    } catch {
      // Pointer was already released, harmless.
    }
  }
  function reset() {
    yaw = seedYaw;
    pitch = seedPitch;
  }
</script>

<div
  class="cube-viewport"
  style="--cube-size: {size}px"
  role="img"
  aria-label="3D cube view (drag to rotate)"
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
  ondblclick={reset}
>
  <div
    class="cube"
    style="transform: rotateX({pitch}deg) rotateY({yaw}deg)"
  >
    {#each FACES as face (face.name)}
      <div class="face" style="transform: {face.transform}">
        {#each Array(9) as _, slot (slot)}
          <div
            class="sticker"
            style="background: {COLOR_HEX[cubeState[face.faceIdx * 9 + slot]!]}"
          ></div>
        {/each}
      </div>
    {/each}
  </div>
</div>

<style>
  .cube-viewport {
    --cube-half: calc(var(--cube-size) / 2);
    width: var(--cube-size);
    height: var(--cube-size);
    perspective: calc(var(--cube-size) * 4);
    cursor: grab;
    touch-action: none;
    user-select: none;
    display: inline-block;
  }
  .cube-viewport:active {
    cursor: grabbing;
  }
  .cube {
    width: 100%;
    height: 100%;
    position: relative;
    transform-style: preserve-3d;
  }
  .face {
    position: absolute;
    width: 100%;
    height: 100%;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: repeat(3, 1fr);
    gap: 2px;
    padding: 3px;
    background: #181818;
    border-radius: 4px;
    box-sizing: border-box;
  }
  .sticker {
    border-radius: 3px;
  }
</style>
