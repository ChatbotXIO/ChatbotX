import ky from "ky"
import { createStore } from "zustand/vanilla"

export type MailerLiteGroup = {
  id: string
  name: string
}

export type MailerLiteField = {
  id: string
  name: string
}

export type MailerLiteState = {
  loadingGroups: boolean
  groups: MailerLiteGroup[]
  loadingFields: boolean
  fields: MailerLiteField[]
  error: string | null
}

export type MailerLiteActions = {
  fetchGroups: (chatbotId: string) => Promise<void>
  fetchFields: (chatbotId: string) => Promise<void>
}

export type MailerLiteStore = MailerLiteState & MailerLiteActions

export const createMailerLiteStore = () =>
  createStore<MailerLiteStore>((set, get) => ({
    loadingGroups: false,
    groups: [],
    loadingFields: false,
    fields: [],
    error: null,

    fetchGroups: async (chatbotId: string) => {
      const { groups, loadingGroups } = get()
      if (groups.length > 0 || loadingGroups) {
        return
      }

      set({ loadingGroups: true, error: null })
      try {
        const data = await ky
          .get(`/api/chatbots/${chatbotId}/mailer-lite?action=groups`)
          .json<MailerLiteGroup[]>()
        set({ groups: data, loadingGroups: false })
      } catch (_error) {
        set({
          error: "mailerlite.error.fetch_groups",
          loadingGroups: false,
        })
      }
    },

    fetchFields: async (chatbotId: string) => {
      const { fields, loadingFields } = get()
      if (fields.length > 0 || loadingFields) {
        return
      }

      set({ loadingFields: true, error: null })
      try {
        const data = await ky
          .get(`/api/chatbots/${chatbotId}/mailer-lite?action=fields`)
          .json<MailerLiteField[]>()
        set({ fields: data, loadingFields: false })
      } catch (_error) {
        set({
          error: "mailerlite.error.fetch_fields",
          loadingFields: false,
        })
      }
    },
  }))
