import ky, { HTTPError } from "ky"
import { createStore } from "zustand/vanilla"

export type AnalysisState = {
  loading: boolean
  error: string | null

  chatbotId: string
  from: number | null
  to: number | null
}

export type AnalysisActions = {
  loadAnalysisData: (chatbotId: string) => Promise<void>
  getTotalContacts: (chatbotId: string) => Promise<void>
  setRange: (from: number, to: number) => Promise<void>
}

export type AnalysisStore = AnalysisState & AnalysisActions

export const createAnalysisStore = () =>
  createStore<AnalysisStore>((set, get) => ({
    loading: false,
    error: null,

    chatbotId: "",
    from: null,
    to: null,

    loadAnalysisData: async (chatbotId: string) => {
      const { getTotalContacts } = get()
      set({ loading: true, error: null })

      try {
        await Promise.all([getTotalContacts(chatbotId)])
        set({
          loading: false,
        })
      } catch (error: unknown) {
        if (error instanceof HTTPError) {
          set({
            error: error.message,
            loading: false,
          })
        } else {
          set({
            error: "Failed to fetch analysis data",
            loading: false,
          })
        }
      }
    },

    getTotalContacts: async (chatbotId: string) => {
      const { from, to } = get()
      if (from === null || to === null) {
        return
      }
      const searchParams = new URLSearchParams({
        from: from.toString(),
        to: to.toString(),
      })
      const { data } = await ky
        .get(
          `/api/chatbots/${chatbotId}/total-contacts?${searchParams.toString()}`,
        )
        .json()
      console.log(data)

      // set({ totalContacts: data })
    },

    setRange: async (from: number, to: number) => {
      set({ from, to })
      const { loadAnalysisData, chatbotId } = get()
      await loadAnalysisData(chatbotId)
    },
  }))
