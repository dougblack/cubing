<script lang="ts">
  import type { SessionId } from "@cubing/core";
  import { buildExportSnapshot } from "./export";
  import { formatDateTime } from "./format";
  import { timerStore } from "./timer-store.svelte";

  const sessions = $derived(timerStore.sessions);
  const currentId = $derived(timerStore.currentSessionId);
  const current = $derived(sessions.find((s) => s.id === currentId));
  const canDelete = $derived(sessions.length > 1);

  function onSelect(e: Event) {
    const id = (e.currentTarget as HTMLSelectElement).value as SessionId;
    timerStore.setCurrentSession(id);
  }

  function onNew() {
    timerStore.createSession();
  }

  function onDelete() {
    if (!current || !canDelete) return;
    const ok = window.confirm(
      `Delete session ${current.name} and its solves? This can't be undone.`,
    );
    if (!ok) return;
    timerStore.deleteSession(current.id);
  }

  function onExport() {
    const snapshot = buildExportSnapshot(
      timerStore.sessions,
      timerStore.solves,
    );
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const stamp = new Date(snapshot.exportedAt)
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cubing-export-${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }
</script>

<div class="session-switcher">
  <select onchange={onSelect} value={currentId ?? ""}>
    {#each sessions as s (s.id)}
      <option value={s.id}>session {s.name}</option>
    {/each}
  </select>
  {#if current}
    <span class="started">started {formatDateTime(current.createdAt)}</span>
  {/if}
  <span class="spacer"></span>
  <button
    class="icon-btn"
    title="Download every session and solve as a JSON file"
    onclick={onExport}>export</button
  >
  <button class="icon-btn" title="New session" onclick={onNew}>+ new</button>
  <button
    class="icon-btn danger"
    title={canDelete ? "Delete this session" : "Can't delete the last session"}
    disabled={!canDelete}
    onclick={onDelete}>delete</button
  >
</div>

<style>
  .session-switcher {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  select {
    font: inherit;
    font-size: 13px;
    padding: 4px 8px;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: var(--color-surface);
    color: var(--color-text);
    cursor: pointer;
  }
  .started {
    font-size: 12px;
    color: var(--color-text-muted);
  }
  .spacer {
    flex: 1 1 0;
  }
  .icon-btn {
    font: inherit;
    font-size: 12px;
    padding: 4px 10px;
    border: 1px solid var(--color-border);
    border-radius: 4px;
    background: var(--color-surface);
    color: var(--color-text-muted);
    cursor: pointer;
    transition:
      background 0.12s ease,
      color 0.12s ease;
  }
  .icon-btn:hover:not(:disabled) {
    background: var(--color-surface-2);
    color: var(--color-text);
  }
  .icon-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .icon-btn.danger:hover:not(:disabled) {
    color: var(--color-danger);
  }
</style>
