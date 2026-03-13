import ky, { HTTPError } from "ky"
import { createStore } from "zustand/vanilla"
import { maxPerPageString } from "@/lib/shared-request"
import type { ListCustomFieldsResponse } from "../schemas/query"
import type { CustomFieldResource } from "../schemas/resource"

export type CustomFieldState = {
  loading: boolean
  error: string | null
  initialized: boolean

  chatbotId: string
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

    chatbotId: "",
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
            error instanceof HTTPError
              ? error.message
              : "Failed to fetch custom fields",
        })
      } finally {
        set({ initialized: true })
      }
    },

    getAllCustomFields: async () => {
      const { chatbotId, loading } = get()

      // Skip if already initialized for the same chatbotId or currently loading
      if (loading || !chatbotId) {
        return
      }

      set({ loading: true, error: null })

      try {
        const searchParams = new URLSearchParams({
          perPage: maxPerPageString,
        })
        const { data } = await ky
          .get<ListCustomFieldsResponse>(
            `/api/chatbots/${chatbotId}/custom-fields?${searchParams.toString()}`,
          )
          .json()

        set({
          customFields: data,
        })
      } catch (error: unknown) {
        set({
          error:
            error instanceof HTTPError
              ? error.message
              : "Failed to fetch custom fields",
        })
      } finally {
        set({ loading: false })
      }
    },
  }))
