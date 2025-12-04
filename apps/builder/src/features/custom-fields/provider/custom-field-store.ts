import type { FieldType } from "@aha.chat/database/types"
import ky, { HTTPError } from "ky"
import { createStore } from "zustand/vanilla"
import { maxPerPageString } from "@/lib/shared-request"
import type { CustomFieldCollection, CustomFieldResource } from "../schemas"

export type CustomFieldSelectOption = {
  label: string
  value: string
  type: FieldType
}

export type CustomFieldState = {
  loading: boolean
  error: string | null
  initialized: boolean

  chatbotId: string
  customFields: CustomFieldResource[]
}

export type CustomFieldActions = {
  initialize: () => Promise<void>
  getAllCustomFields: (chatbotId: string) => Promise<void>
  getCustomFieldSelectOptions: () => CustomFieldSelectOption[]
}

export type CustomFieldStore = CustomFieldState & CustomFieldActions

export const createCustomFieldStore = () =>
  createStore<CustomFieldStore>((set, get) => ({
    loading: false,
    error: null,
    initialized: false,

    chatbotId: "",
    customFields: [],

    initialize: async () => {
      const { initialized } = get()

      if (initialized) {
        return
      }

      set({ loading: true, error: null })

      try {
        await get().getAllCustomFields(get().chatbotId)
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
            error: "Failed to fetch custom fields",
            loading: false,
          })
        }
      }
    },

    getAllCustomFields: async (chatbotId: string) => {
      const searchParams = new URLSearchParams({
        perPage: maxPerPageString,
      })
      const { data } = await ky
        .get<CustomFieldCollection>(
          `/api/chatbots/${chatbotId}/custom-fields?${searchParams.toString()}`,
        )
        .json()

      set({ customFields: data })
    },

    getCustomFieldSelectOptions: () => {
      const { customFields } = get()

      return customFields.map((customField) => ({
        label: customField.name,
        value: customField.id,
        type: customField.fieldType,
      }))
    },
  }))
