"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";

/** Le tableau de bord est conçu en clair ; le sombre reste un choix explicite. */
const DEFAULT_THEME: Theme = "light";
const STORAGE_KEY = "labstock-theme";

/* Le thème vit sur <html data-theme>, posé avant l'hydratation par le script
   inline du layout. On s'abonne à cette source plutôt que de la dupliquer. */
const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function getSnapshot(): Theme {
  return (document.documentElement.dataset.theme as Theme) || DEFAULT_THEME;
}

function getServerSnapshot(): Theme {
  return DEFAULT_THEME;
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* stockage indisponible : le thème reste valable pour la session */
  }
  listeners.forEach((notify) => notify());
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const next: Theme = theme === "dark" ? "light" : "dark";

  return (
    <button
      type="button"
      onClick={() => applyTheme(next)}
      aria-label={next === "dark" ? "Passer en mode sombre" : "Passer en mode clair"}
      title={next === "dark" ? "Mode sombre" : "Mode clair"}
      className="card grid h-[38px] w-[38px] place-items-center text-[var(--text-secondary)] transition-colors hover:bg-[var(--page)]"
    >
      {theme === "dark" ? (
        <Sun size={15} strokeWidth={2.2} aria-hidden />
      ) : (
        <Moon size={15} strokeWidth={2.2} aria-hidden />
      )}
    </button>
  );
}
