<script lang="ts">
  // Global cube-connection control, mounted once in the site header. The
  // Bluetooth connection is app-wide state (one physical cube, one store
  // singleton), so it lives in the chrome rather than being duplicated as a
  // card on every page that talks to the cube. Connection *lifecycle* lives
  // here; solve-flow actions like "cube is solved" stay on the page that
  // owns the scramble, since they have page-specific side effects.

  import { bluetoothStore, forgetCachedCubeMacs } from "$lib/bluetooth.svelte";

  let menuOpen = $state(false);
  let wrap = $state<HTMLElement | undefined>();
  // Web Bluetooth availability depends on `navigator`, absent during
  // prerender. Gate the "unsupported" messaging behind a mounted flag so the
  // server-rendered markup (a plain "connect" button) matches first hydration
  // and only resolves to the unsupported state on the client.
  let mounted = $state(false);
  $effect(() => {
    mounted = true;
  });

  const available = $derived(bluetoothStore.isAvailable());
  const status = $derived(bluetoothStore.status);
  const battLabel = $derived(
    bluetoothStore.batteryPct === null ? "?%" : `${bluetoothStore.batteryPct}%`,
  );

  $effect(() => {
    if (!menuOpen) return;
    function onDoc(e: MouseEvent) {
      if (wrap && !wrap.contains(e.target as Node)) menuOpen = false;
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") menuOpen = false;
    }
    window.addEventListener("click", onDoc);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", onDoc);
      window.removeEventListener("keydown", onKey);
    };
  });

  function connect() {
    bluetoothStore.connect();
    menuOpen = false;
  }
  function disconnect() {
    bluetoothStore.disconnect();
    menuOpen = false;
  }
  function forget() {
    forgetCachedCubeMacs();
    menuOpen = false;
  }
</script>

<div class="cube-conn" bind:this={wrap}>
  {#if status === "connected"}
    <button
      class="conn-chip is-on"
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      title="Cube connected — click for options"
      onclick={() => (menuOpen = !menuOpen)}
    >
      <span class="conn-dot on"></span>
      <span class="conn-name">{bluetoothStore.deviceName ?? "cube"}</span>
      <span class="conn-batt">{battLabel}</span>
    </button>
  {:else if status === "connecting"}
    <span class="conn-chip is-pending">
      <span class="conn-dot pending"></span>connecting…
    </span>
  {:else}
    <!-- disconnected / error (and the prerender pass, before availability is
         known). The chip connects in one click; the caret opens recovery. -->
    <button
      class="conn-chip is-connect"
      disabled={mounted && !available}
      title={mounted && !available
        ? "Web Bluetooth isn't supported here — try Chrome, Edge, or Brave."
        : "Connect a GAN smart cube over Bluetooth"}
      onclick={connect}
    >
      <span class="conn-dot" class:err={status === "error"}></span>
      connect cube
    </button>
    <button
      class="conn-caret"
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      aria-label="Connection options"
      onclick={() => (menuOpen = !menuOpen)}>▾</button
    >
  {/if}

  {#if menuOpen}
    <div class="conn-menu" role="menu">
      {#if status === "connected"}
        <div class="conn-info">
          <span class="conn-info-label">device</span>
          <span>{bluetoothStore.deviceName ?? "cube"}</span>
        </div>
        <div class="conn-info">
          <span class="conn-info-label">battery</span>
          <span>{battLabel}</span>
        </div>
        {#if bluetoothStore.recentMoves.length > 0}
          <code class="conn-ticker">{bluetoothStore.recentMoves.join(" ")}</code
          >
        {/if}
        <div class="conn-divider"></div>
        <button class="conn-action danger" role="menuitem" onclick={disconnect}
          >disconnect</button
        >
        <button class="conn-action subtle" role="menuitem" onclick={forget}
          >forget cached MAC</button
        >
      {:else}
        {#if status === "error" && bluetoothStore.errorMessage}
          <p class="conn-msg err">{bluetoothStore.errorMessage}</p>
        {:else if mounted && !available}
          <p class="conn-msg">
            Web Bluetooth isn't supported in this browser. Try Chrome, Edge, or
            Brave on desktop or Android.
          </p>
        {:else}
          <p class="conn-msg">
            Connect a GAN smart cube to track moves, auto-start the timer, and
            drill cases in the trainer.
          </p>
        {/if}
        <button
          class="conn-action"
          role="menuitem"
          disabled={mounted && !available}
          onclick={connect}>connect cube</button
        >
        <button class="conn-action subtle" role="menuitem" onclick={forget}
          >forget cached MAC</button
        >
      {/if}
    </div>
  {/if}
</div>

<style>
  .cube-conn {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 2px;
  }
  .conn-chip {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    font: inherit;
    font-size: 13px;
    font-weight: 500;
    padding: 6px 11px;
    border: 1px solid var(--color-border);
    border-radius: 7px;
    background: var(--color-surface);
    color: var(--color-text-muted);
    cursor: pointer;
    transition:
      background 0.12s ease,
      color 0.12s ease,
      border-color 0.12s ease;
  }
  .conn-chip:hover:not(:disabled) {
    color: var(--color-text);
    background: var(--color-surface-2);
  }
  .conn-chip:disabled {
    cursor: not-allowed;
    opacity: 0.55;
  }
  /* Connect = a quiet green-accented call to action. */
  .is-connect {
    color: var(--cube-green-text);
    border-color: color-mix(in srgb, var(--cube-green) 40%, var(--color-border));
  }
  .is-connect:hover:not(:disabled) {
    color: var(--cube-green-text);
    background: var(--cube-green-tint);
    border-color: var(--cube-green);
  }
  /* Connected = a green-tinted live chip carrying name + battery. */
  .is-on {
    color: var(--color-text);
    border-color: color-mix(in srgb, var(--cube-green) 35%, var(--color-border));
    background: var(--cube-green-tint);
  }
  .is-on:hover {
    background: var(--cube-green-tint);
    border-color: var(--cube-green);
  }
  .is-pending {
    color: var(--color-text-muted);
    cursor: default;
  }
  .conn-name {
    max-width: 12ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .conn-batt {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--color-text-muted);
    font-variant-numeric: tabular-nums;
  }
  .conn-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--color-unlearned);
    flex: none;
  }
  .conn-dot.on {
    background: var(--cube-green);
    box-shadow: 0 0 0 3px var(--cube-green-tint);
  }
  .conn-dot.pending {
    background: var(--color-warn);
    animation: conn-pulse 1s ease-in-out infinite;
  }
  .conn-dot.err {
    background: var(--cube-red);
  }
  @keyframes conn-pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.3;
    }
  }
  .conn-caret {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 28px;
    padding: 0;
    font-size: 10px;
    border: none;
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    border-radius: 6px;
  }
  .conn-caret:hover {
    color: var(--color-text);
    background: var(--color-surface-2);
  }

  .conn-menu {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    min-width: 220px;
    padding: 8px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.04),
      0 12px 28px -8px rgba(0, 0, 0, 0.18);
    z-index: 60;
    animation: conn-pop 0.14s ease;
  }
  @keyframes conn-pop {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  .conn-info {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 3px 8px;
    font-size: 13px;
  }
  .conn-info-label {
    color: var(--color-text-muted);
  }
  .conn-ticker {
    display: block;
    margin: 4px 8px 2px;
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--color-text-muted);
    word-break: break-word;
  }
  .conn-msg {
    margin: 2px 8px 8px;
    font-size: 12px;
    line-height: 1.45;
    color: var(--color-text-muted);
  }
  .conn-msg.err {
    color: var(--color-danger);
  }
  .conn-divider {
    height: 1px;
    background: var(--color-border);
    margin: 6px 6px;
  }
  .conn-action {
    display: block;
    width: 100%;
    text-align: left;
    font: inherit;
    font-size: 13px;
    padding: 7px 8px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--color-text);
    cursor: pointer;
    transition:
      background 0.12s ease,
      color 0.12s ease;
  }
  .conn-action:hover:not(:disabled) {
    background: var(--color-surface-2);
  }
  .conn-action:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .conn-action.danger:hover {
    color: var(--color-danger);
  }
  .conn-action.subtle {
    font-size: 12px;
    color: var(--color-text-muted);
  }
  .conn-action.subtle:hover {
    color: var(--color-text);
  }

  @media (max-width: 600px) {
    .conn-name {
      display: none;
    }
  }
</style>
