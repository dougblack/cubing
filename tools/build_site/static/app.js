// Track learning state per case in a single cookie.
// States: 0 = unlearned (not stored), 1 = learning, 2 = learned.
// Cookie value is URL-encoded JSON: {"case-id": 1, ...}

const COOKIE_NAME = "cubing_state";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365 * 5; // 5 years
const STATES = ["unlearned", "learning", "learned"];

function getAllState() {
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(COOKIE_NAME + "="));
  if (!match) return {};
  try {
    return JSON.parse(decodeURIComponent(match.slice(COOKIE_NAME.length + 1)));
  } catch {
    return {};
  }
}

function saveAllState(state) {
  const value = encodeURIComponent(JSON.stringify(state));
  document.cookie = `${COOKIE_NAME}=${value}; max-age=${COOKIE_MAX_AGE}; path=/; SameSite=Lax`;
}

function getCaseState(caseId) {
  return getAllState()[caseId] || 0;
}

function cycleCaseState(caseId) {
  const all = getAllState();
  const next = ((all[caseId] || 0) + 1) % 3;
  if (next === 0) delete all[caseId];
  else all[caseId] = next;
  saveAllState(all);
  return next;
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

document.addEventListener("DOMContentLoaded", () => {
  // Apply existing state to all case elements (cards on stage page, single el on case detail).
  const all = getAllState();
  document.querySelectorAll("[data-case-id]").forEach((el) => {
    applyStateToElement(el, all[el.dataset.caseId] || 0);
  });

  // Wire up state-flag clicks. The flag is a <button> inside the card; clicking
  // it must not bubble up to any wrapping <a>.
  document.querySelectorAll(".state-flag").forEach((flag) => {
    flag.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const target = flag.closest("[data-case-id]");
      if (!target) return;
      const next = cycleCaseState(target.dataset.caseId);
      applyStateToElement(target, next);
    });
  });
});
