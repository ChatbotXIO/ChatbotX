import ky, { HTTPError } from "ky"
import { createStore } from "zustand/vanilla"
import type { PaginatedResponse } from "@/features/common/schemas/pagination"
import { maxPerPageString } from "@/lib/shared-request"
import type { InboxResource } from "../schema/resource"
import { client } from "@/lib/orpc/orpc"
import type { ListInboxesResponse } from "../schema/action"

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
      const { workspaceId, loadingInboxes } = get()

      if (loadingInboxes || !workspaceId) {
        return
      }
      set({ loadingInboxes: true, error: null })
      try {
        const { data } = await client.inboxesAPI.listInboxesAuthenticatedAPI({
          workspaceId,
          includes: ["integration"],
          perPage: maxPerPageString,
          sort: {
            createdAt: "desc",
          },
        })
        //  ky
        //   .get<PaginatedResponse<InboxResource>>(
        //     `/api/workspaces/${workspaceId}/inboxes?${searchParams.toString()}`,
        //   )
        //   .json()

        set({ inboxes: data })
      } catch (error: unknown) {
        set({
          error:
            error instanceof HTTPError
              ? error.message
              : "Failed to fetch inboxes",
        })
      } finally {
        set({ loadingInboxes: false })
      }
    },
  }))
