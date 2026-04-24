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
}

export type ContactActions = {
  initialize: () => Promise<void>
  getContactsCount: (params?: {
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
    ...props,

    initialize: async () => {
      const { initialized } = get()

      if (initialized) {
        return
      }

      await get().getContactsCount()
      set({ initialized: true })
    },

    getContactsCount: async (params) => {
      const { workspaceId, loadingCounts } = get()

      if (loadingCounts || !workspaceId) {
        return
      }

      set({ loadingCounts: true, error: null })

      try {
        let contactFilter: ContactFilterRequest["contactFilter"][] = []
        if (
          params?.channel &&
          params.channel !== channelTypes.enum.omnichannel
        ) {
          contactFilter = [
            {
              operator: "and",
              conditions: [
                {
                  field: "channel",
                  operator: "is",
                  value: [params.channel],
                },
              ],
            },
          ]
        }

        const { total } =
          await client.contactsAPIs.countContactsAuthenticatedAPI({
            workspaceId,
            sort: [],
            contactFilter,
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
  }))
