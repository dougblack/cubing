<script lang="ts">
  import { theme } from "./theme.svelte";
</script>

<button
  class="theme-toggle"
  aria-label="Toggle dark mode"
  title={theme.mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
  onclick={() => theme.toggle()}
>
  {#if theme.mode === "dark"}
    <!-- sun icon -->
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
      stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  {:else}
    <!-- moon icon -->
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
      stroke-linecap="round" stroke-linejoin="round" width="16" height="16">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  {/if}
</button>

<style>
  .theme-toggle {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    margin-left: 12px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    color: var(--color-text-muted);
    cursor: pointer;
    transition:
      color 0.12s ease,
      border-color 0.12s ease,
      background 0.12s ease;
  }
  .theme-toggle:hover {
    color: var(--color-text);
    border-color: var(--color-border);
    background: var(--color-surface-2);
  }
</style>
