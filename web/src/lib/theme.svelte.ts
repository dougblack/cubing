// Light/dark theme preference. Persists choice in localStorage. The anti-
// flash script in app.html applies the class before first paint based on the
// same logic, so the body of the constructor here is mostly redundant for
// initial load — but covers the case where the script didn't run (SSR, etc.).

import { browser } from "$app/environment";

const STORAGE_KEY = "cubing_theme";
type Mode = "light" | "dark";

function systemPrefersDark(): boolean {
  return browser && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function readSaved(): Mode | null {
  if (!browser) return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw === "light" || raw === "dark" ? raw : null;
}

class Theme {
  mode = $state<Mode>("light");

  constructor() {
    if (!browser) return;
    this.mode = readSaved() ?? (systemPrefersDark() ? "dark" : "light");
    this.apply();
  }

  toggle(): void {
    this.mode = this.mode === "dark" ? "light" : "dark";
    if (browser) window.localStorage.setItem(STORAGE_KEY, this.mode);
    this.apply();
  }

  private apply(): void {
    if (!browser) return;
    document.documentElement.classList.toggle("dark", this.mode === "dark");
  }
}

export const theme = new Theme();
