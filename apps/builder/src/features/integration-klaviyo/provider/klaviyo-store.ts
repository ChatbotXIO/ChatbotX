import type {
  KlaviyoField,
  KlaviyoList,
  KlaviyoTag,
} from "@aha.chat/integration-klaviyo"
import ky from "ky"
import { createStore } from "zustand/vanilla"

export type KlaviyoState = {
  loadingLists: boolean
  lists: KlaviyoList[]

  loadingTags: boolean
  tags: KlaviyoTag[]

  loadingFields: boolean
  fields: KlaviyoField[]

  error: string | null
}

export type KlaviyoActions = {
  fetchLists: (chatbotId: string) => Promise<void>
  fetchTags: (chatbotId: string) => Promise<void>
  fetchFields: (chatbotId: string) => Promise<void>
}

export type KlaviyoStore = KlaviyoState & KlaviyoActions

export const createKlaviyoStore = () =>
  createStore<KlaviyoStore>((set, get) => ({
    loadingLists: false,
    lists: [],
    loadingTags: false,
    tags: [],
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
        const { data } = await ky
          .get<{ data: KlaviyoList[] }>(
            `/api/chatbots/${chatbotId}/klaviyo?action=lists`,
          )
          .json()
        set({ lists: data, loadingLists: false })
      } catch (_error) {
        set({
          error: "klaviyo.error.fetch_lists",
          loadingLists: false,
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
          .get<{ data: KlaviyoTag[] }>(
            `/api/chatbots/${chatbotId}/klaviyo?action=tags`,
          )
          .json()
        set({ tags: data, loadingTags: false })
      } catch (_error) {
        set({
          error: "klaviyo.error.fetch_tags",
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
          .get<{ data: KlaviyoField[] }>(
            `/api/chatbots/${chatbotId}/klaviyo?action=fields`,
          )
          .json()
        set({ fields: data, loadingFields: false })
      } catch (_error) {
        set({
          error: "klaviyo.error.fetch_fields",
          loadingFields: false,
        })
      }
    },
  }))
