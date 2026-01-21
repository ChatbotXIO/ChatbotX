import type { GetResponseTag } from "@aha.chat/integration-get-response"
import ky from "ky"
import { createStore } from "zustand/vanilla"

export type GetResponseCampaign = {
  id: string
  name: string
}

export type GetResponseState = {
  loadingCampaigns: boolean
  campaigns: GetResponseCampaign[]
  loadingTags: boolean
  tags: GetResponseTag[]
  error: string | null
}

export type GetResponseActions = {
  fetchCampaigns: (chatbotId: string) => Promise<void>
  fetchTags: (chatbotId: string) => Promise<void>
}

export type GetResponseStore = GetResponseState & GetResponseActions

export const createGetResponseStore = () =>
  createStore<GetResponseStore>((set, get) => ({
    loadingCampaigns: false,
    campaigns: [],
    loadingTags: false,
    tags: [],
    error: null,

    fetchCampaigns: async (chatbotId: string) => {
      const { campaigns, loadingCampaigns } = get()
      if (campaigns.length > 0 || loadingCampaigns) {
        return
      }

      set({ loadingCampaigns: true, error: null })
      try {
        const { data } = await ky
          .get<{ data: GetResponseCampaign[] }>(
            `/api/chatbots/${chatbotId}/get-response?action=campaigns`,
          )
          .json()
        set({ campaigns: data, loadingCampaigns: false })
      } catch (_error) {
        set({
          error: "getResponse.error.fetch_campaigns",
          loadingCampaigns: false,
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
          .get<{ data: GetResponseTag[] }>(
            `/api/chatbots/${chatbotId}/get-response?action=tags`,
          )
          .json()
        set({ tags: data, loadingTags: false })
      } catch (_error) {
        set({
          error: "getResponse.error.fetch_tags",
          loadingTags: false,
        })
      }
    },
  }))
