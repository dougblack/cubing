<script lang="ts">
  import "../app.css";
  import { base } from "$app/paths";
  import { page } from "$app/state";
  import { STAGES } from "$lib/stages";
  import { getStageFile } from "$lib/data";
  import ThemeToggle from "$lib/ThemeToggle.svelte";

  let { children } = $props();

  // Footer totals across all stages.
  const totals = (() => {
    let cases = 0;
    let algs = 0;
    for (const s of STAGES) {
      const file = getStageFile(s.slug);
      if (!file) continue;
      cases += file.cases.length;
      for (const c of file.cases) algs += c.algorithms.length;
    }
    return { cases, algs };
  })();

  // Current path with the base prefix stripped, for active-link matching.
  const path = $derived(
    base && page.url.pathname.startsWith(base)
      ? page.url.pathname.slice(base.length) || "/"
      : page.url.pathname,
  );
  const onTimer = $derived(path === "/");
  const onTrainer = $derived(path.startsWith("/trainer"));
  const onAlgs = $derived(path.startsWith("/cfop"));

  // Algs dropdown open/close, with outside-click + Escape + route-change.
  let algsOpen = $state(false);
  let algsWrap = $state<HTMLElement | undefined>();

  $effect(() => {
    if (!algsOpen) return;
    function onDocClick(e: MouseEvent) {
      if (algsWrap && !algsWrap.contains(e.target as Node)) algsOpen = false;
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") algsOpen = false;
    }
    window.addEventListener("click", onDocClick);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("click", onDocClick);
      window.removeEventListener("keydown", onKey);
    };
  });

  // Close the menu whenever the route changes.
  $effect(() => {
    void path;
    algsOpen = false;
  });
</script>

<div class="cube-strip" aria-hidden="true">
  <span style="background: var(--cube-green)"></span>
  <span style="background: var(--cube-yellow)"></span>
  <span style="background: var(--cube-red)"></span>
  <span style="background: var(--cube-blue)"></span>
  <span style="background: var(--cube-orange)"></span>
</div>

<header class="site-header">
  <a href="{base}/" class="brand">
    <span class="brand-pips" aria-hidden="true">
      <i style="background: var(--cube-green)"></i>
      <i style="background: var(--cube-yellow)"></i>
      <i style="background: var(--cube-red)"></i>
      <i style="background: var(--cube-blue)"></i>
    </span>
    cubing
  </a>

  <nav>
    <a
      href="{base}/"
      class="nav-link"
      class:active={onTimer}
      style="--accent: var(--accent-timer)">Timer</a
    >
    <a
      href="{base}/trainer"
      class="nav-link"
      class:active={onTrainer}
      style="--accent: var(--accent-trainer)">Trainer</a
    >

    <div class="algs-menu" bind:this={algsWrap}>
      <button
        type="button"
        class="nav-link algs-trigger"
        class:active={onAlgs}
        style="--accent: var(--color-text)"
        aria-haspopup="true"
        aria-expanded={algsOpen}
        onclick={() => (algsOpen = !algsOpen)}
      >
        Algs
        <span class="caret" class:open={algsOpen}>▾</span>
      </button>

      {#if algsOpen}
        <div class="algs-dropdown" role="menu">
          <a
            href="{base}/cfop"
            class="algs-item algs-item-all"
            role="menuitem"
            class:active={path === "/cfop" || path === "/cfop/"}
          >
            All algorithms
          </a>
          <div class="algs-divider"></div>
          {#each STAGES as s (s.slug)}
            <a
              href="{base}/cfop/{s.slug}"
              class="algs-item"
              role="menuitem"
              class:active={path.startsWith(`/cfop/${s.slug}`)}
              style="--accent: var(--stage-{s.slug})"
            >
              <span class="algs-dot" style="background: var(--stage-{s.slug})"
              ></span>
              <span class="algs-label">{s.shortName}</span>
              <span class="algs-sub">{s.fullName}</span>
            </a>
          {/each}
        </div>
      {/if}
    </div>

    <span class="nav-spacer"></span>
    <ThemeToggle />
  </nav>
</header>

<main>
  {@render children()}
</main>

<footer class="site-footer">
  <span>
    {totals.cases} cases, {totals.algs} algorithms · data from algdb.net,
    jperm.net, speedcubedb.com
  </span>
</footer>

<style>
  /* Signature: a speedcube color strip framing the very top of the app. */
  .cube-strip {
    display: flex;
    height: 3px;
    width: 100%;
  }
  .cube-strip span {
    flex: 1;
  }

  .site-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 32px;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface);
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    font-family: var(--font-serif);
    font-weight: 600;
    font-size: 20px;
    letter-spacing: -0.005em;
    color: var(--color-text);
  }
  /* Four cube pips as the brand mark — a 2x2 sticker quad. */
  .brand-pips {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 2px;
    width: 18px;
    height: 18px;
  }
  .brand-pips i {
    border-radius: 2px;
    display: block;
  }

  nav {
    display: flex;
    align-items: center;
    gap: 4px;
  }
  .nav-link {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    color: var(--color-text-muted);
    background: transparent;
    border: none;
    cursor: pointer;
    font-family: inherit;
    transition:
      color 0.12s ease,
      background 0.12s ease;
  }
  .nav-link:hover {
    color: var(--color-text);
    background: var(--color-surface-2);
  }
  /* Active link adopts its section accent, with a colored underline rule. */
  .nav-link.active {
    color: var(--accent);
  }
  .nav-link.active::after {
    content: "";
    position: absolute;
    left: 12px;
    right: 12px;
    bottom: 1px;
    height: 2px;
    border-radius: 2px;
    background: var(--accent);
  }

  .algs-menu {
    position: relative;
    display: inline-flex;
  }
  .algs-trigger .caret {
    font-size: 10px;
    transition: transform 0.15s ease;
    color: var(--color-text-muted);
  }
  .algs-trigger.active .caret {
    color: var(--color-text);
  }
  .caret.open {
    transform: rotate(180deg);
  }

  .algs-dropdown {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    min-width: 240px;
    padding: 6px;
    background: var(--color-surface);
    border: 1px solid var(--color-border);
    border-radius: 10px;
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.04),
      0 12px 28px -8px rgba(0, 0, 0, 0.18);
    z-index: 50;
    animation: algs-pop 0.14s ease;
  }
  @keyframes algs-pop {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  .algs-item {
    display: grid;
    grid-template-columns: auto auto 1fr;
    align-items: baseline;
    gap: 8px;
    padding: 8px 10px;
    border-radius: 6px;
    color: var(--color-text);
    border-left: 2px solid transparent;
    transition: background 0.12s ease;
  }
  .algs-item:hover {
    background: var(--color-surface-2);
  }
  .algs-item.active {
    border-left-color: var(--accent, var(--color-link));
    background: var(--color-surface-2);
  }
  .algs-item-all {
    grid-template-columns: 1fr;
    font-size: 13px;
    font-weight: 600;
    color: var(--color-text);
  }
  .algs-divider {
    height: 1px;
    background: var(--color-border);
    margin: 4px 6px;
  }
  .algs-dot {
    width: 9px;
    height: 9px;
    border-radius: 2px;
    align-self: center;
  }
  .algs-label {
    font-size: 13px;
    font-weight: 600;
  }
  .algs-sub {
    font-size: 11px;
    color: var(--color-text-muted);
    text-align: right;
    white-space: nowrap;
  }

  .nav-spacer {
    width: 4px;
  }

  main {
    padding: 32px;
    max-width: 1200px;
    margin: 0 auto;
  }

  .site-footer {
    padding: 24px 32px;
    border-top: 1px solid var(--color-border);
    color: var(--color-text-muted);
    font-size: 12px;
    text-align: center;
    margin-top: 64px;
  }

  @media (max-width: 600px) {
    main {
      padding: 20px;
    }
    .site-header {
      padding: 12px 16px;
      flex-wrap: wrap;
      gap: 8px;
    }
    nav {
      gap: 2px;
    }
    .nav-link {
      padding: 6px 9px;
    }
    .algs-sub {
      display: none;
    }
    .algs-dropdown {
      min-width: 180px;
    }
  }
</style>
