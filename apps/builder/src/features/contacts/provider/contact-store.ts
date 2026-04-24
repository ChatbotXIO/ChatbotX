import { type ChannelType, channelTypes } from "@chatbotx.io/database/partials"
import { HTTPError } from "ky"
import { createStore } from "zustand/vanilla"
import { client } from "@/lib/orpc/orpc"
import type { ContactFilterRequest } from "../schemas/query"

export type ContactState = {
  loadingCounts: boolean
  error: string | null
  initialized: boolean

  workspaceId: string
  count: number | null
  contactInboxesCount: number | null
}

export type ContactActions = {
  initialize: () => Promise<void>
  getContactsCount: () => Promise<void>
  getContactInboxesCount: (params?: {
    contactFilter?: ContactFilterRequest["contactFilter"]
    channel?: ChannelType
  }) => Promise<void>
}

export type ContactStore = ContactState & ContactActions

export const createContactStore = (props: Partial<ContactState>) =>
  createStore<ContactStore>((set, get) => ({
    loadingCounts: false,
    error: null,
    initialized: false,

    workspaceId: "",
    count: null,
    contactInboxesCount: null,
    ...props,

    initialize: async () => {
      const { initialized } = get()

      if (initialized) {
        return
      }

      await get().getContactsCount()
      set({ initialized: true })
    },

    getContactsCount: async () => {
      const { workspaceId, loadingCounts } = get()

      if (loadingCounts || !workspaceId) {
        return
      }

      set({ loadingCounts: true, error: null })

      try {
        const { total } =
          await client.contactsAPIs.countContactsAuthenticatedAPI({
            workspaceId,
            sort: [],
          })

        set({ count: total, loadingCounts: false })
      } catch (error: unknown) {
        set({
          error:
            error instanceof HTTPError
              ? error.message
              : "Failed to fetch contacts count",
        })
      } finally {
        set({ loadingCounts: false })
      }
    },

    getContactInboxesCount: async (params) => {
      const { workspaceId, loadingCounts } = get()

      if (loadingCounts || !workspaceId) {
        return
      }

      set({ loadingCounts: true, error: null })

      try {
        const { total } =
          await client.contactsAPIs.countContactInboxesAuthenticatedAPI({
            workspaceId,
            sort: [],
            channels: [params?.channel || channelTypes.enum.omnichannel],
            contactFilter: params?.contactFilter,
          })

        set({ contactInboxesCount: total, loadingCounts: false })
      } catch (error: unknown) {
        set({
          error:
            error instanceof HTTPError
              ? error.message
              : "Failed to fetch contacts count",
        })
      } finally {
        set({ loadingCounts: false })
      }
    },
  }))
