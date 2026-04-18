import { whatsappTemplateStatusSchema } from "@chatbotx.io/database/partials"
import ky, { HTTPError } from "ky"
import { createStore } from "zustand/vanilla"
import type { ListWhatsappMessageTemplatesResponse } from "@/features/integration-whatsapp/message-templates/schema/query"

export type FlowTemplateState = {
  error: string | null
  initialized: boolean

  workspaceId: string

  loadingWhatsappTemplates: boolean
  whatsappTemplates: ListWhatsappMessageTemplatesResponse
}

export type FlowTemplateActions = {
  initialize: () => Promise<void>
  fetchWhatsappTemplates: () => Promise<void>
}

export type FlowTemplateStore = FlowTemplateState & FlowTemplateActions

export const createFlowTemplateStore = (props: Partial<FlowTemplateState>) =>
  createStore<FlowTemplateStore>((set, get) => ({
    error: null,
    initialized: false,

    workspaceId: "",

    loadingWhatsappTemplates: false,
    whatsappTemplates: [],

    ...props,

    initialize: async () => {
      const { initialized, workspaceId, fetchWhatsappTemplates } = get()

      if (initialized || !workspaceId) {
        return
      }

      try {
        await fetchWhatsappTemplates()
      } catch (error: unknown) {
        set({
          error:
            error instanceof HTTPError
              ? error.message
              : "Failed to fetch WA templates",
        })
      } finally {
        set({ initialized: true })
      }
    },

    fetchWhatsappTemplates: async () => {
      const { workspaceId, loadingWhatsappTemplates } = get()

      if (loadingWhatsappTemplates) {
        return
      }

      set({ loadingWhatsappTemplates: true, error: null })
      try {
        const templates = await ky
          .get<ListWhatsappMessageTemplatesResponse>(
            `/api/workspaces/${workspaceId}/whatsapp-message-templates`,
            {
              searchParams: {
                status: whatsappTemplateStatusSchema.enum.APPROVED,
              },
            },
          )
          .json()

        set({
          whatsappTemplates: templates,
        })
      } catch (error: unknown) {
        set({
          error:
            error instanceof HTTPError
              ? error.message
              : "Failed to fetch WA templates",
        })
      } finally {
        set({ loadingWhatsappTemplates: false })
      }
    },
  }))
