import { create } from "zustand";

export type Theme = "light" | "dark";

const THEME_STORAGE_KEY = "faceace-theme";

function getInitialTheme(): Theme {
  return localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.style.colorScheme = theme;
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute(
    "content",
    theme === "dark" ? "#0f172a" : "#ffffff",
  );
}

interface UIState {
  ttsAutoPlay: boolean;
  theme: Theme;
  setTtsAutoPlay: (v: boolean) => void;
  toggleTheme: () => void;
}

const initialTheme = getInitialTheme();
applyTheme(initialTheme);

export const useUIStore = create<UIState>((set) => ({
  ttsAutoPlay: false,
  theme: initialTheme,
  setTtsAutoPlay: (v) => set({ ttsAutoPlay: v }),
  toggleTheme: () =>
    set((state) => {
      const theme: Theme = state.theme === "dark" ? "light" : "dark";
      localStorage.setItem(THEME_STORAGE_KEY, theme);
      applyTheme(theme);
      return { theme };
    }),
}));
