import type { SendFoxList } from "@aha.chat/integration-send-fox"
import ky from "ky"
import { createStore } from "zustand/vanilla"

export type SendFoxState = {
  loadingLists: boolean
  lists: SendFoxList[]
  error: string | null
}

export type SendFoxActions = {
  fetchLists: (chatbotId: string) => Promise<void>
}

export type SendFoxStore = SendFoxState & SendFoxActions

export const createSendFoxStore = () =>
  createStore<SendFoxStore>((set, get) => ({
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
          .get<SendFoxList[]>(
            `/api/chatbots/${chatbotId}/send-fox?action=lists`,
          )
          .json()
        set({ lists: data, loadingLists: false })
      } catch (_error) {
        set({
          error: "send-fox.error.fetch_lists",
          loadingLists: false,
        })
      }
    },
  }))
