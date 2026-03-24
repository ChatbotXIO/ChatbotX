import ky, { HTTPError } from "ky"
import { createStore } from "zustand/vanilla"
import type { PaginatedResponse } from "@/features/common/schemas/pagination"
import { maxPerPageString } from "@/lib/shared-request"
import type { InboxResource } from "../schemas/resource"

export type InboxState = {
  loading: boolean
  error: string | null
  initialized: boolean

  chatbotId: string
  inboxes: InboxResource[]
}

export type InboxActions = {
  initialize: () => Promise<void>
  getAllInboxes: () => Promise<void>
}

export type InboxStore = InboxState & InboxActions

export const createInboxStore = (props: Partial<InboxState>) =>
  createStore<InboxStore>((set, get) => ({
    loading: false,
    error: null,
    initialized: false,

    chatbotId: "",
    inboxes: [],
    ...props,

    initialize: async () => {
      const { initialized } = get()

      if (initialized) {
        return
      }

      try {
        await get().getAllInboxes()
      } catch (error: unknown) {
        set({
          error:
            error instanceof HTTPError
              ? error.message
              : "Failed to fetch inboxes",
        })
      } finally {
        set({ initialized: true })
      }
    },

    getAllInboxes: async () => {
      const { chatbotId, loading } = get()

      if (loading || !chatbotId) {
        return
      }
      set({ loading: true, error: null })
      try {
        const searchParams = new URLSearchParams({
          integration: "true",
          perPage: maxPerPageString,
        })
        const { data } = await ky
          .get<PaginatedResponse<InboxResource>>(
            `/api/chatbots/${chatbotId}/inboxes?${searchParams.toString()}`,
          )
          .json()

        set({ inboxes: data })
      } catch (error: unknown) {
        set({
          error:
            error instanceof HTTPError
              ? error.message
              : "Failed to fetch inboxes",
        })
      } finally {
        set({ loading: false })
      }
    },
  }))
