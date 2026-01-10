import type {
  ActiveCampaignAutomation,
  ActiveCampaignCustomField,
  ActiveCampaignList,
  ActiveCampaignTag,
} from "@aha.chat/integration-active-campaign"
import ky from "ky"
import { createStore } from "zustand/vanilla"

export type ActiveCampaignState = {
  loadingLists: boolean
  lists: ActiveCampaignList[]

  loadingTags: boolean
  tags: ActiveCampaignTag[]

  loadingFields: boolean
  fields: ActiveCampaignCustomField[]

  loadingAutomations: boolean
  automations: ActiveCampaignAutomation[]

  error: string | null
}

export type ActiveCampaignActions = {
  fetchLists: (chatbotId: string) => Promise<void>
  fetchTags: (chatbotId: string) => Promise<void>
  fetchFields: (chatbotId: string) => Promise<void>
  fetchAutomations: (chatbotId: string) => Promise<void>
}

export type ActiveCampaignStore = ActiveCampaignState & ActiveCampaignActions

export const createActiveCampaignStore = () =>
  createStore<ActiveCampaignStore>((set, get) => ({
    loadingLists: false,
    lists: [],
    loadingTags: false,
    tags: [],
    loadingFields: false,
    fields: [],
    loadingAutomations: false,
    automations: [],
    error: null,

    fetchLists: async (chatbotId: string) => {
      const { lists, loadingLists } = get()
      if (lists.length > 0 || loadingLists) {
        return
      }

      set({ loadingLists: true, error: null })
      try {
        const { data } = await ky
          .get<{ data: ActiveCampaignList[] }>(
            `/api/chatbots/${chatbotId}/active-campaign?action=lists`,
          )
          .json()
        set({ lists: data, loadingLists: false })
      } catch (_error) {
        set({
          error: "activeCampaign.error.fetch_lists",
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
          .get<{ data: ActiveCampaignTag[] }>(
            `/api/chatbots/${chatbotId}/active-campaign?action=tags`,
          )
          .json()
        set({ tags: data, loadingTags: false })
      } catch (_error) {
        set({
          error: "activeCampaign.error.fetch_tags",
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
          .get<{ data: ActiveCampaignCustomField[] }>(
            `/api/chatbots/${chatbotId}/active-campaign?action=fields`,
          )
          .json()
        set({ fields: data, loadingFields: false })
      } catch (_error) {
        set({
          error: "activeCampaign.error.fetch_fields",
          loadingFields: false,
        })
      }
    },

    fetchAutomations: async (chatbotId: string) => {
      const { automations, loadingAutomations } = get()
      if (automations.length > 0 || loadingAutomations) {
        return
      }

      set({ loadingAutomations: true, error: null })
      try {
        const { data } = await ky
          .get<{ data: ActiveCampaignAutomation[] }>(
            `/api/chatbots/${chatbotId}/active-campaign?action=automations`,
          )
          .json()
        set({ automations: data, loadingAutomations: false })
      } catch (_error) {
        set({
          error: "activeCampaign.error.fetch_automations",
          loadingAutomations: false,
        })
      }
    },
  }))
