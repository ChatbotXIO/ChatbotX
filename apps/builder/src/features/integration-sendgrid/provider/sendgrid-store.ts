import ky from "ky"
import { createStore } from "zustand/vanilla"

export type SendGridList = {
  id: string
  name: string
}

export type SendGridField = {
  id: string
  name: string
}

export type SendGridState = {
  loadingLists: boolean
  lists: SendGridList[]
  loadingFields: boolean
  fields: SendGridField[]
  error: string | null
}

export type SendGridActions = {
  fetchLists: (chatbotId: string) => Promise<void>
  fetchFields: (chatbotId: string) => Promise<void>
}

export type SendGridStore = SendGridState & SendGridActions

export const createSendGridStore = () =>
  createStore<SendGridStore>((set, get) => ({
    loadingLists: false,
    lists: [],
    loadingFields: false,
    fields: [],
    error: null,

    fetchLists: async (chatbotId: string) => {
      const { lists, loadingLists } = get()
      if (lists.length > 0 || loadingLists) {
        return
      }

      set({ loadingLists: true, error: null })
      try {
        const data = await ky
          .get(`/api/chatbots/${chatbotId}/sendgrid?action=lists`)
          .json<SendGridList[]>()
        set({ lists: data, loadingLists: false })
      } catch (_error) {
        set({
          error: "sendgrid.error.fetch_lists",
          loadingLists: false,
        })
      }
    },

    fetchFields: async (chatbotId: string) => {
      const { fields, loadingFields } = get()
      if (fields.length > 0 || loadingFields) {
        return
      }

      set({ loadingFields: true, error: null })
      try {
        const data = await ky
          .get(`/api/chatbots/${chatbotId}/sendgrid?action=fields`)
          .json<SendGridField[]>()
        set({ fields: data, loadingFields: false })
      } catch (_error) {
        set({
          error: "sendgrid.error.fetch_fields",
          loadingFields: false,
        })
      }
    },
  }))
