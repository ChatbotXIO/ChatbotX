import type { MoosendList } from "@aha.chat/integration-moosend"
import ky from "ky"
import { createStore } from "zustand/vanilla"

export type MoosendState = {
  loadingLists: boolean
  lists: MoosendList[]
  error: string | null
}

export type MoosendActions = {
  fetchLists: (chatbotId: string) => Promise<void>
}

export type MoosendStore = MoosendState & MoosendActions

export const createMoosendStore = () =>
  createStore<MoosendStore>((set, get) => ({
    loadingLists: false,
    lists: [],
    error: null,

    fetchLists: async (chatbotId: string) => {
      const { lists, loadingLists } = get()
      if (lists.length > 0 || loadingLists) {
        return
      }

      set({ loadingLists: true, error: null })
      try {
        const data = await ky
          .get<MoosendList[]>(`/api/chatbots/${chatbotId}/moosend?action=lists`)
          .json()
        set({ lists: data, loadingLists: false })
      } catch (_error) {
        set({
          error: "moosend.error.fetch_lists",
          loadingLists: false,
        })
      }
    },
  }))
