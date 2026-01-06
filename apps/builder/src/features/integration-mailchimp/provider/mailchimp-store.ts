import type {
  MailchimpAudienceResource,
  MailchimpMergeFieldResource,
  MailchimpTagResource,
} from "@aha.chat/integration-mailchimp"
import ky from "ky"
import { createStore } from "zustand/vanilla"

export type MailchimpState = {
  loadingLists: boolean
  lists: MailchimpAudienceResource[]

  loadingTags: Record<string, boolean>
  tagsByListId: Record<string, MailchimpTagResource[]>

  loadingMergeFields: Record<string, boolean>
  mergeFieldsByListId: Record<string, MailchimpMergeFieldResource[]>

  error: string | null
}

export type MailchimpActions = {
  fetchLists: (chatbotId: string) => Promise<void>
  fetchTags: (chatbotId: string, listId: string) => Promise<void>
  fetchMergeFields: (chatbotId: string, listId: string) => Promise<void>
}

export type MailchimpStore = MailchimpState & MailchimpActions

export const createMailchimpStore = () =>
  createStore<MailchimpStore>((set, get) => ({
    loadingLists: false,
    lists: [],
    loadingTags: {},
    tagsByListId: {},
    loadingMergeFields: {},
    mergeFieldsByListId: {},
    error: null,

    fetchLists: async (chatbotId: string) => {
      const { lists, loadingLists } = get()
      if (lists.length > 0 || loadingLists) {
        return
      }

      set({ loadingLists: true, error: null })
      try {
        const { data } = await ky
          .get<{ data: MailchimpAudienceResource[] }>(
            `/api/chatbots/${chatbotId}/mailchimp?action=lists`,
          )
          .json()
        set({ lists: data, loadingLists: false })
      } catch (_error) {
        set({ error: "mailchimp.error.fetch_lists", loadingLists: false })
      }
    },

    fetchTags: async (chatbotId: string, listId: string) => {
      const { tagsByListId, loadingTags } = get()
      if (tagsByListId[listId] || loadingTags[listId]) {
        return
      }

      set((state) => ({
        loadingTags: { ...state.loadingTags, [listId]: true },
        error: null,
      }))

      try {
        const { data } = await ky
          .get<{ data: MailchimpTagResource[] }>(
            `/api/chatbots/${chatbotId}/mailchimp?action=tags&listId=${listId}`,
          )
          .json()
        set((state) => ({
          tagsByListId: { ...state.tagsByListId, [listId]: data },
          loadingTags: { ...state.loadingTags, [listId]: false },
        }))
      } catch (_error) {
        set((state) => ({
          loadingTags: { ...state.loadingTags, [listId]: false },
          error: "mailchimp.error.fetch_tags",
        }))
      }
    },

    fetchMergeFields: async (chatbotId: string, listId: string) => {
      const { mergeFieldsByListId, loadingMergeFields } = get()
      if (mergeFieldsByListId[listId] || loadingMergeFields[listId]) {
        return
      }

      set((state) => ({
        loadingMergeFields: { ...state.loadingMergeFields, [listId]: true },
        error: null,
      }))

      try {
        const { data } = await ky
          .get<{ data: MailchimpMergeFieldResource[] }>(
            `/api/chatbots/${chatbotId}/mailchimp?action=merge-fields&listId=${listId}`,
          )
          .json()
        set((state) => ({
          mergeFieldsByListId: {
            ...state.mergeFieldsByListId,
            [listId]: data,
          },
          loadingMergeFields: { ...state.loadingMergeFields, [listId]: false },
        }))
      } catch (_error) {
        set((state) => ({
          loadingMergeFields: { ...state.loadingMergeFields, [listId]: false },
          error: "mailchimp.error.fetch_merge_fields",
        }))
      }
    },
  }))
