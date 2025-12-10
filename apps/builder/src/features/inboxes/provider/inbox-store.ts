import ky, { HTTPError } from "ky"
import { createStore } from "zustand/vanilla"
import { maxPerPageString } from "@/lib/shared-request"
import type { InboxCollection, InboxResource } from "../schemas/resource"

export type InboxState = {
  loading: boolean
  error: string | null
  initialized: boolean

  chatbotId: string
  inboxes: InboxResource[]
}

export type InboxActions = {
  initialize: (chatbotId: string) => Promise<void>
  getAllInboxes: (chatbotId: string) => Promise<void>
}

export type InboxStore = InboxState & InboxActions

export const createInboxStore = () =>
  createStore<InboxStore>((set, get) => ({
    loading: false,
    error: null,
    initialized: false,

    chatbotId: "",
    inboxes: [],

    initialize: async (chatbotId: string) => {
      const { initialized } = get()

      if (initialized) {
        return
      }

      set({ loading: true, error: null })

      try {
        await get().getAllInboxes(chatbotId)
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
            error: "Failed to fetch inboxes",
            loading: false,
          })
        }
      }
    },

    getAllInboxes: async (chatbotId: string) => {
      const searchParams = new URLSearchParams({
        perPage: maxPerPageString,
      })
      const { data } = await ky
        .get<InboxCollection>(
          `/api/chatbots/${chatbotId}/inboxes?${searchParams.toString()}`,
        )
        .json()

      set({ inboxes: data })
    },
  }))
