import { create } from "zustand";

interface UIState {
  ttsAutoPlay: boolean;
  setTtsAutoPlay: (v: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  ttsAutoPlay: false,
  setTtsAutoPlay: (v) => set({ ttsAutoPlay: v }),
}));
