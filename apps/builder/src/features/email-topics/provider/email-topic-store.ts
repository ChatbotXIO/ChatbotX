import { createStore } from "zustand/vanilla"
import { client } from "@/lib/orpc/orpc"
import { maxPerPage } from "@/lib/shared-request"
import type { EmailTopicResource } from "../schema/resource"

export type EmailTopicState = {
  loading: boolean
  error: string | null
  initialized: boolean

  workspaceId: string
  emailTopics: EmailTopicResource[]
}

export type EmailTopicActions = {
  initialize: () => Promise<void>
  getAllEmailTopics: () => Promise<void>
}

export type EmailTopicStore = EmailTopicState & EmailTopicActions

export const createEmailTopicStore = (props: Partial<EmailTopicState>) =>
  createStore<EmailTopicStore>((set, get) => ({
    loading: false,
    error: null,
    initialized: false,

    workspaceId: "",
    emailTopics: [],
    ...props,

    initialize: async () => {
      const { initialized } = get()
      if (initialized) {
        return
      }
      await get().getAllEmailTopics()
      set({ initialized: true })
    },

    getAllEmailTopics: async () => {
      const { workspaceId, loading } = get()
      if (loading || !workspaceId) {
        return
      }

      set({ loading: true, error: null })

      try {
        const { data } =
          await client.emailTopicsAPI.privateListWorkspaceEmailTopicsAPI({
            workspaceId,
            perPage: maxPerPage,
          })

        set({ emailTopics: data, loading: false })
      } catch (error: unknown) {
        set({
          error:
            error instanceof Error
              ? error.message
              : "Failed to fetch email topics",
        })
      } finally {
        set({ loading: false })
      }
    },
  }))
