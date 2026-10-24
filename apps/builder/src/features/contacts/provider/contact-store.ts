import type {
  BroadcastSubaction,
  ChannelType,
} from "@chatbotx.io/database/partials"
import { createStore } from "zustand/vanilla"
import { getClientErrorMessage } from "@/lib/orpc/client-error"
import { client } from "@/lib/orpc/orpc"
import type { ContactFilterRequest } from "../schema/query"

export type ContactState = {
  loadingCounts: boolean
  loadingInboxesCount: boolean
  inboxesCountReqId: number
  error: string | null
  initialized: boolean

  workspaceId: string
  count: number | null
  /** True when `count` stopped at the server's cap (a lower bound). */
  countCapped: boolean
  contactInboxesCount: number | null
  /** True when `contactInboxesCount` stopped at the server's cap. */
  contactInboxesCountCapped: boolean
}

export type ContactActions = {
  initialize: () => Promise<void>
  getContactsCount: () => Promise<void>
  getContactInboxesCount: (params?: {
    contactFilter?: ContactFilterRequest["contactFilter"]
    channel?: ChannelType
    inboxIds?: string[]
    integrationWhatsappId?: string
    integrationMessengerId?: string
    subaction?: BroadcastSubaction
  }) => Promise<void>
}

export type ContactStore = ContactState & ContactActions

export const createContactStore = (props: Partial<ContactState>) =>
  createStore<ContactStore>((set, get) => ({
    loadingCounts: false,
    loadingInboxesCount: false,
    inboxesCountReqId: 0,
    error: null,
    initialized: false,

    workspaceId: "",
    count: null,
    countCapped: false,
    contactInboxesCount: null,
    contactInboxesCountCapped: false,
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
        const { total, totalCountCapped } =
          await client.contactsAPIs.countContactsAuthenticatedAPI({
            workspaceId,
            sort: [],
            countMode: "bounded",
          })

        set({
          count: total,
          countCapped: totalCountCapped ?? false,
          loadingCounts: false,
        })
      } catch (error: unknown) {
        set({
          error: getClientErrorMessage(error, "Failed to fetch contacts count"),
        })
      } finally {
        set({ loadingCounts: false })
      }
    },

    getContactInboxesCount: async (params) => {
      const { workspaceId } = get()

      if (!workspaceId) {
        return
      }

      const reqId = get().inboxesCountReqId + 1
      set({
        inboxesCountReqId: reqId,
        loadingInboxesCount: true,
        error: null,
      })

      try {
        const { total, totalCountCapped } =
          await client.contactsAPIs.countContactInboxesAuthenticatedAPI({
            workspaceId,
            sort: [],
            channels: params?.channel ? [params.channel] : [],
            inboxIds: params?.inboxIds,
            integrationWhatsappId: params?.integrationWhatsappId,
            integrationMessengerId: params?.integrationMessengerId,
            contactFilter: params?.contactFilter,
            subaction: params?.subaction,
            countMode: "bounded",
          })

        if (get().inboxesCountReqId !== reqId) {
          return
        }

        set({
          contactInboxesCount: total,
          contactInboxesCountCapped: totalCountCapped ?? false,
          loadingInboxesCount: false,
        })
      } catch (error: unknown) {
        if (get().inboxesCountReqId !== reqId) {
          return
        }

        set({
          error: getClientErrorMessage(error, "Failed to fetch contacts count"),
          loadingInboxesCount: false,
        })
      } finally {
        if (get().inboxesCountReqId === reqId) {
          set({ loadingInboxesCount: false })
        }
      }
    },
  }))
