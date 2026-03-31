import ky, { HTTPError } from "ky"
import { createStore } from "zustand/vanilla"
import type { MessageTemplate } from "../type"

export type TemplateState = {
  loading: boolean
  error: string | null
  initialized: boolean

  chatbotId: bigint
  integrationWhatsappId?: string
  templates: MessageTemplate[]
}

export type TemplateActions = {
  initialize: () => Promise<void>
  getAllTemplates: () => Promise<void>
  setIntegrationWhatsappId: (id?: string) => void
}

export type TemplateStore = TemplateState & TemplateActions

export const createTemplateStore = (props: Partial<TemplateState>) =>
  createStore<TemplateStore>((set, get) => ({
    loading: false,
    error: null,
    initialized: false,

    chatbotId: BigInt(0),
    templates: [],
    ...props,

    initialize: async () => {
      const { initialized } = get()

      if (initialized) {
        return
      }

      try {
        await get().getAllTemplates()
      } catch (error: unknown) {
        set({
          error:
            error instanceof HTTPError
              ? error.message
              : "Failed to fetch templates",
        })
      } finally {
        set({ initialized: true })
      }
    },

    getAllTemplates: async () => {
      const { chatbotId, integrationWhatsappId, loading } = get()

      if (loading || !chatbotId || !integrationWhatsappId) {
        if (!integrationWhatsappId) {
          set({ templates: [] })
        }
        return
      }

      try {
        set({ loading: true, error: null })

        const url = `/api/chatbots/${chatbotId}/channels/${integrationWhatsappId}/whatsapp-templates`

        const templates = await ky.get(url).json<MessageTemplate[]>()

        set({ templates })
      } catch (error: unknown) {
        set({
          error:
            error instanceof HTTPError
              ? error.message
              : "Failed to fetch templates",
          templates: [],
        })
      } finally {
        set({ loading: false })
      }
    },

    setIntegrationWhatsappId: (id?: string) => {
      set({ integrationWhatsappId: id })
      get().getAllTemplates()
    },
  }))
