import { createStore } from "zustand/vanilla"
import { client } from "@/lib/orpc/orpc"
import { maxPerPage } from "@/lib/shared-request"
import type { CustomFieldResource } from "../schema/resource"

export type CustomFieldState = {
  loading: boolean
  error: string | null
  initialized: boolean

  workspaceId: string
  customFields: CustomFieldResource[]
}

export type CustomFieldActions = {
  initialize: () => Promise<void>
  getAllCustomFields: () => Promise<void>
}

export type CustomFieldStore = CustomFieldState & CustomFieldActions

export const createCustomFieldStore = (props: Partial<CustomFieldState>) =>
  createStore<CustomFieldStore>((set, get) => ({
    loading: false,
    error: null,
    initialized: false,

    workspaceId: "",
    customFields: [],
    ...props,

    initialize: async () => {
      const { initialized } = get()

      if (initialized) {
        return
      }

      try {
        await get().getAllCustomFields()
      } catch (error: unknown) {
        set({
          error:
            error instanceof Error
              ? error.message
              : "Failed to fetch custom fields",
        })
      } finally {
        set({ initialized: true })
      }
    },

    getAllCustomFields: async () => {
      const { workspaceId, loading } = get()

      // Skip if already initialized for the same workspaceId or currently loading
      if (loading || !workspaceId) {
        return
      }

      set({ loading: true, error: null })

      try {
        const { data } =
          await client.customFieldsAPI.privateListCustomFieldsAPI({
            workspaceId,
            perPage: maxPerPage,
          })

        set({
          customFields: data,
        })
      } catch (error: unknown) {
        set({
          error:
            error instanceof Error
              ? error.message
              : "Failed to fetch custom fields",
        })
      } finally {
        set({ loading: false })
      }
    },
  }))
