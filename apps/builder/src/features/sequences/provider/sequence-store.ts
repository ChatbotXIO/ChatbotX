import ky, { HTTPError } from "ky"
import { createStore } from "zustand/vanilla"
import { maxPerPageString } from "@/lib/shared-request"
import type { ListSequencesResponse } from "../schema/action"

export type SequenceState = {
  loading: boolean
  error: string | null
  initialized: boolean

  workspaceId: string
  sequences: ListSequencesResponse["data"]
}

export type SequenceActions = {
  initialize: () => void
  getAllActiveSequences: (workspaceId: string) => void
}

export type SequenceStore = SequenceState & SequenceActions

export const createSequenceStore = (props: Partial<SequenceState> = {}) =>
  createStore<SequenceStore>((set, get) => ({
    loading: false,
    error: null,
    initialized: false,

    workspaceId: "",
    sequences: [],
    ...props,

    initialize: async () => {
      const { initialized, workspaceId } = get()

      if (initialized) {
        return
      }

      set({ loading: true, error: null })

      try {
        await get().getAllActiveSequences(workspaceId)
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
            error: "Failed to fetch sequences",
            loading: false,
          })
        }
      }
    },

    getAllActiveSequences: async (workspaceId: string) => {
      const { data } = await ky
        .get<ListSequencesResponse>(
          `/api/workspaces/${workspaceId}/sequences`,
          {
            searchParams: {
              perPage: maxPerPageString,
              active: "true",
            },
          },
        )
        .json()

      set({ sequences: data })
    },
  }))
