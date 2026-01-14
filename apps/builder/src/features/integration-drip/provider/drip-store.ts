import type { DripCustomField } from "@aha.chat/integration-drip"
import ky from "ky"
import { createStore } from "zustand/vanilla"

export type DripAccount = {
  id: string
  name: string
}

export type DripState = {
  loadingAccounts: boolean
  accounts: DripAccount[]

  loadingTags: boolean
  tags: string[]

  loadingFields: boolean
  fields: DripCustomField[]

  error: string | null
}

export type DripActions = {
  fetchAccounts: (chatbotId: string) => Promise<void>
  fetchTags: (chatbotId: string) => Promise<void>
  fetchFields: (chatbotId: string) => Promise<void>
}

export type DripStore = DripState & DripActions

export const createDripStore = () =>
  createStore<DripStore>((set, get) => ({
    loadingAccounts: false,
    accounts: [],
    loadingTags: false,
    tags: [],
    loadingFields: false,
    fields: [],
    error: null,

    fetchAccounts: async (chatbotId: string) => {
      const { accounts, loadingAccounts } = get()
      if (accounts.length > 0 || loadingAccounts) {
        return
      }

      set({ loadingAccounts: true, error: null })
      try {
        const { data } = await ky
          .get<{ data: DripAccount[] }>(
            `/api/chatbots/${chatbotId}/drip?action=accounts`,
          )
          .json()
        set({ accounts: data, loadingAccounts: false })
      } catch (_error) {
        set({
          error: "drip.error.fetch_accounts",
          loadingAccounts: false,
        })
      }
    },

    fetchTags: async (chatbotId: string) => {
      const { tags, loadingTags } = get()
      if (tags.length > 0 || loadingTags) {
        return
      }

      set({ loadingTags: true, error: null })
      try {
        const { data } = await ky
          .get<{ data: string[] }>(
            `/api/chatbots/${chatbotId}/drip?action=tags`,
          )
          .json()
        set({ tags: data, loadingTags: false })
      } catch (_error) {
        set({
          error: "drip.error.fetch_tags",
          loadingTags: false,
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
        const { data } = await ky
          .get<{ data: DripCustomField[] }>(
            `/api/chatbots/${chatbotId}/drip?action=fields`,
          )
          .json()
        set({ fields: data, loadingFields: false })
      } catch (_error) {
        set({
          error: "drip.error.fetch_fields",
          loadingFields: false,
        })
      }
    },
  }))
