import type { ListInboxesResponse } from "@chatbotx.io/business"
import { createStore } from "zustand/vanilla"
import { getClientErrorMessage } from "@/lib/orpc/client-error"
import { client } from "@/lib/orpc/orpc"
import { maxPerPage } from "@/lib/shared-request"

export type InboxState = {
  error: string | null
  initialized: boolean

  workspaceId: string

  loadingInboxes: boolean
  inboxes: ListInboxesResponse["data"]
}

export type InboxActions = {
  initialize: () => Promise<void>
  getAllInboxes: () => Promise<void>
}

export type InboxStore = InboxState & InboxActions

export const createInboxStore = (props: Partial<InboxState>) =>
  createStore<InboxStore>((set, get) => ({
    error: null,
    initialized: false,

    workspaceId: "",

    loadingInboxes: false,
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
          error: getClientErrorMessage(error, "Failed to fetch inboxes"),
        })
      } finally {
        set({ initialized: true })
      }
    },

    getAllInboxes: async () => {
      const { workspaceId, loadingInboxes } = get()

      if (loadingInboxes || !workspaceId) {
        return
      }
      set({ loadingInboxes: true, error: null })
      try {
        const { data } = await client.inboxesAPI.listInboxesAuthenticatedAPI({
          workspaceId,
          includes: ["integration"],
          perPage: maxPerPage,
        })

        set({ inboxes: data })
      } catch (error: unknown) {
        set({
          error: getClientErrorMessage(error, "Failed to fetch inboxes"),
        })
      } finally {
        set({ loadingInboxes: false })
      }
    },
  }))
