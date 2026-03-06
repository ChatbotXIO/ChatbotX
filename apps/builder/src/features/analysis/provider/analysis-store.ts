import { createStore } from "zustand/vanilla"

export type AnalysisState = {
  chatbotId: string
  from: number | null
  to: number | null
}

export type AnalysisActions = {
  setRange: (from: number, to: number) => void
}

export type AnalysisStore = AnalysisState & AnalysisActions

export const createAnalysisStore = () =>
  createStore<AnalysisStore>((set) => ({
    chatbotId: "",
    from: null,
    to: null,

    setRange: (from: number, to: number) => {
      set({ from, to })
    },
  }))
