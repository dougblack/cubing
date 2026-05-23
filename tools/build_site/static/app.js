// Per-case state in a single cookie.
//   state[caseId]: 0 = unlearned (not stored), 1 = learning, 2 = learned
//   pref[caseId]:  index of the user's preferred algorithm for that case
// Cookie value is URL-encoded JSON: {"state": {...}, "pref": {...}}
// Legacy shape (pre-pref): {"case-id": 1, ...}; migrated transparently on read.

const COOKIE_NAME = "cubing_state";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 5; // 5 years
const STATES = ["unlearned", "learning", "learned"];

function readCookie() {
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(COOKIE_NAME + "="));
  if (!match) return null;
  try {
    return JSON.parse(decodeURIComponent(match.slice(COOKIE_NAME.length + 1)));
  } catch {
    return null;
  }
}

function getAll() {
  const raw = readCookie() ?? {};
  if (raw && (raw.state !== undefined || raw.pref !== undefined)) {
    return { state: raw.state ?? {}, pref: raw.pref ?? {} };
  }
  // Legacy: top level was the state map. Treat as such.
  return { state: raw || {}, pref: {} };
}

function saveAll(all) {
  const value = encodeURIComponent(JSON.stringify(all));
  document.cookie = `${COOKIE_NAME}=${value}; max-age=${COOKIE_MAX_AGE}; path=/; SameSite=Lax`;
}

function cycleCaseState(caseId) {
  const all = getAll();
  const next = ((all.state[caseId] || 0) + 1) % 3;
  if (next === 0) delete all.state[caseId];
  else all.state[caseId] = next;
  saveAll(all);
  return next;
}

function toggleCasePref(caseId, algIndex) {
  // Click on the active alg's star = clear. Click on a different alg = switch.
  const all = getAll();
  if (all.pref[caseId] === algIndex) delete all.pref[caseId];
  else all.pref[caseId] = algIndex;
  saveAll(all);
  return all.pref[caseId];
}

function applyStateToElement(el, state) {
  const name = STATES[state] || STATES[0];
  el.dataset.state = name;
  const label = el.querySelector(".state-label");
  if (label) {
    label.textContent =
      state === 1 ? "learning" :
      state === 2 ? "learned" :
      "not learned yet";
  }
}

function refreshLearnedSummaries() {
  const all = getAll();
  const roster = window.STAGE_CASE_IDS || {};
  document.querySelectorAll("[data-learned-summary]").forEach((el) => {
    const stage = el.dataset.learnedSummary;
    const ids = roster[stage] || [];
    const learned = ids.reduce((n, id) => n + (all.state[id] === 2 ? 1 : 0), 0);
    el.textContent = `${learned} / ${ids.length} learned`;
  });
}

function applyPrefToCard(card, prefIndex) {
  // On a stage-list card, swap the displayed primary alg with the user's
  // preferred alg (if any). Falls back to whatever the server rendered.
  const algEl = card.querySelector(".case-primary-alg");
  if (!algEl) return;
  const moves = JSON.parse(card.dataset.algMoves || "[]");
  if (prefIndex !== undefined && prefIndex >= 0 && prefIndex < moves.length) {
    algEl.textContent = moves[prefIndex];
    algEl.classList.add("is-preferred");
  } else {
    // Restore the rendered fallback (algorithms[0]).
    if (moves.length > 0) algEl.textContent = moves[0];
    algEl.classList.remove("is-preferred");
  }
}

function applyPrefToAlgList(container, prefIndex) {
  // On a case-detail page, highlight the preferred alg row (if any).
  container.querySelectorAll(".alg-item").forEach((item) => {
    const idx = Number(item.dataset.algIndex);
    if (prefIndex !== undefined && idx === prefIndex) {
      item.dataset.preferred = "true";
    } else {
      delete item.dataset.preferred;
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const all = getAll();

  // Apply learning state to every case element (cards + the single el on case detail).
  document.querySelectorAll("[data-case-id]").forEach((el) => {
    applyStateToElement(el, all.state[el.dataset.caseId] || 0);
  });

  // Apply preferred-alg state.
  document.querySelectorAll(".case-card[data-alg-moves]").forEach((card) => {
    applyPrefToCard(card, all.pref[card.dataset.caseId]);
  });
  document.querySelectorAll(".case-detail[data-case-id]").forEach((detail) => {
    applyPrefToAlgList(detail, all.pref[detail.dataset.caseId]);
  });

  refreshLearnedSummaries();

  // Wire up learning-state flag clicks. The flag is a <button> inside the card;
  // clicking it must not bubble up to any wrapping <a>.
  document.querySelectorAll(".state-flag").forEach((flag) => {
    flag.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const target = flag.closest("[data-case-id]");
      if (!target) return;
      const next = cycleCaseState(target.dataset.caseId);
      applyStateToElement(target, next);
      refreshLearnedSummaries();
    });
  });

  // Wire up preferred-alg toggles on case-detail pages.
  document.querySelectorAll(".alg-pref-toggle").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const item = btn.closest(".alg-item");
      const detail = btn.closest(".case-detail[data-case-id]");
      if (!item || !detail) return;
      const idx = Number(item.dataset.algIndex);
      const newPref = toggleCasePref(detail.dataset.caseId, idx);
      applyPrefToAlgList(detail, newPref);
    });
  });
});
