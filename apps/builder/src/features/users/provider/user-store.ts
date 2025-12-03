import ky, { HTTPError } from "ky"
import { createStore } from "zustand/vanilla"
import type {
  ChatbotMemberCollection,
  ChatbotMemberResource,
} from "@/features/chatbot-members/schemas/resource"
import type {
  InboxTeamCollection,
  InboxTeamResource,
} from "@/features/inbox-teams/schemas/types"
import { maxPerPageString } from "@/lib/shared-request"

export type UserState = {
  loading: boolean
  error: string | null
  initialized: boolean

  chatbotId: string
  chatbotMembers: ChatbotMemberResource[]
  inboxTeams: InboxTeamResource[]
}

export type UserActions = {
  initializeAgentsAndInboxTeams: () => Promise<void>
  getAllChatbotMembers: (chatbotId: string) => Promise<void>
  getAllInboxTeams: (chatbotId: string) => Promise<void>
}

export type UserStore = UserState & UserActions

export const createUserStore = (props: Partial<UserState>) =>
  createStore<UserStore>((set, get) => ({
    loading: false,
    error: null,
    initialized: false,

    chatbotId: "",
    chatbotMembers: [],
    inboxTeams: [],

    ...props,

    initializeAgentsAndInboxTeams: async () => {
      const { initialized } = get()

      if (initialized) {
        return
      }

      set({ loading: true, error: null })

      try {
        await Promise.all([
          get().getAllChatbotMembers(get().chatbotId),
          get().getAllInboxTeams(get().chatbotId),
        ])
        set({
          loading: false,
          initialized: true,
        })
      } catch (error: unknown) {
        if (error instanceof HTTPError) {
          set({
            error: error.message,
            loading: false,
          })
        } else {
          set({
            error: "Failed to fetch agents",
            loading: false,
          })
        }
      }
    },

    getAllChatbotMembers: async (chatbotId: string) => {
      const searchParams = new URLSearchParams({
        perPage: maxPerPageString,
      })
      const { data } = await ky
        .get<ChatbotMemberCollection>(
          `/api/chatbots/${chatbotId}/agents?${searchParams.toString()}`,
        )
        .json()

      set({ chatbotMembers: data })
    },

    getAllInboxTeams: async (chatbotId: string) => {
      const searchParams = new URLSearchParams({
        perPage: maxPerPageString,
      })

      const { data } = await ky
        .get<InboxTeamCollection>(
          `/api/chatbots/${chatbotId}/inbox-teams?${searchParams.toString()}`,
        )
        .json()
      set({ inboxTeams: data })
    },
  }))
