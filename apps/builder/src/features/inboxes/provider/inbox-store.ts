import type { ListAllConnectedInboxesResponse } from "@chatbotx.io/business"
import { createStore } from "zustand/vanilla"
import { getClientErrorMessage } from "@/lib/orpc/client-error"
import { client } from "@/lib/orpc/orpc"

export type InboxState = {
  error: string | null
  initialized: boolean

  workspaceId: string

  loadingInboxes: boolean
  inboxes: ListAllConnectedInboxesResponse["data"]
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
        // The unpaginated endpoint: the paginated list caps at 50 rows, which
        // would hide inboxes from every store consumer (broadcast page
        // picker, inbox/contacts filters) in a workspace with more than 50.
        const { data } = await client.inboxesAPI.listAllInboxesAuthenticatedAPI(
          {
            workspaceId,
            includes: ["integration"],
          },
        )

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
