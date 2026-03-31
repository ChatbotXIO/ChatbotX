import ky, { HTTPError } from "ky"
import { createStore } from "zustand/vanilla"
import type { ListInboxTeamsResponse } from "@/enterprise/features/inbox-teams/schema/action"
import type { ListChatbotMembersResponse } from "@/features/chatbot-members/schema/query"
import { maxPerPageString } from "@/lib/shared-request"

export type UserState = {
  loadingChatbotMembers: boolean
  loadingInboxTeams: boolean
  error: string | null
  initialized: boolean

  chatbotId: bigint
  chatbotMembers: ListChatbotMembersResponse["data"]
  inboxTeams: ListInboxTeamsResponse["data"]
}

export type UserActions = {
  initializeAgentsAndInboxTeams: () => Promise<void>
  getAllChatbotMembers: () => Promise<void>
  getAllInboxTeams: () => Promise<void>
}

export type UserStore = UserState & UserActions

export const createUserStore = (props: Partial<UserState>) =>
  createStore<UserStore>((set, get) => ({
    loadingChatbotMembers: false,
    loadingInboxTeams: false,
    error: null,
    initialized: false,

    chatbotId: BigInt(0),
    chatbotMembers: [],
    inboxTeams: [],
    ...props,

    initializeAgentsAndInboxTeams: async () => {
      const { initialized } = get()

      if (initialized) {
        return
      }

      try {
        await Promise.all([
          get().getAllChatbotMembers(),
          get().getAllInboxTeams(),
        ])
      } catch (error: unknown) {
        set({
          error:
            error instanceof HTTPError
              ? error.message
              : "Failed to fetch agents",
        })
      } finally {
        set({ initialized: true })
      }
    },

    getAllChatbotMembers: async () => {
      const { chatbotId, loadingChatbotMembers } = get()

      if (loadingChatbotMembers || !chatbotId) {
        return
      }

      set({ loadingChatbotMembers: true, error: null })

      try {
        const searchParams = new URLSearchParams({
          perPage: maxPerPageString,
        })
        const { data } = await ky
          .get<ListChatbotMembersResponse>(
            `/api/chatbots/${chatbotId}/members?${searchParams.toString()}`,
          )
          .json()

        set({ chatbotMembers: data })
      } catch (error: unknown) {
        set({
          error:
            error instanceof HTTPError
              ? error.message
              : "Failed to fetch chatbot members",
        })
      } finally {
        set({ loadingChatbotMembers: false })
      }
    },

    getAllInboxTeams: async () => {
      const { chatbotId, loadingInboxTeams } = get()

      // Skip if already initialized for the same chatbotId or currently loading
      if (loadingInboxTeams || !chatbotId) {
        return
      }

      set({ loadingInboxTeams: true, error: null })

      try {
        const searchParams = new URLSearchParams({
          perPage: maxPerPageString,
        })

        const { data } = await ky
          .get<ListInboxTeamsResponse>(
            `/api/chatbots/${chatbotId}/inbox-teams?${searchParams.toString()}`,
          )
          .json()

        set({ inboxTeams: data })
      } catch (error: unknown) {
        set({
          error:
            error instanceof HTTPError
              ? error.message
              : "Failed to fetch inbox teams",
        })
      } finally {
        set({ loadingInboxTeams: false })
      }
    },
  }))
