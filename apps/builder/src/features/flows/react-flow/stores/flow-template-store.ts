import { HTTPError } from "ky"
import { createStore } from "zustand/vanilla"
import { getTemplatesForFlow } from "@/features/integration-whatsapp/message-templates/actions/get-templates-for-flow"
import type { WhatsappMessageTemplateResource } from "@/features/integration-whatsapp/message-templates/schema/resource"
import type { FlowTemplateMenuData } from "../nodes/types"

export type FlowTemplateState = {
  loading: boolean
  error: string | null
  initialized: boolean

  workspaceId: string
  templates: FlowTemplateMenuData
  beforeStep?: { channel?: string; [key: string]: unknown }
}

export type FlowTemplateActions = {
  initialize: () => Promise<void>
  fetchWaTemplates: () => Promise<void>
  setWaTemplates: (templates: WhatsappMessageTemplateResource[]) => void
}

export type FlowTemplateStore = FlowTemplateState & FlowTemplateActions

export const createFlowTemplateStore = (props: Partial<FlowTemplateState>) =>
  createStore<FlowTemplateStore>((set, get) => ({
    loading: false,
    error: null,
    initialized: false,
    workspaceId: "",
    templates: {},
    beforeStep: undefined,
    ...props,

    initialize: async () => {
      const { initialized } = get()

      if (initialized) {
        return
      }

      try {
        await get().fetchWaTemplates()
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

    fetchWaTemplates: async () => {
      const { workspaceId, loading } = get()

      if (loading || !workspaceId) {
        return
      }

      set({ loading: true, error: null })
      try {
        const waTemplates = await getTemplatesForFlow(workspaceId)

        set({
          templates: {
            ...get().templates,
            waTemplates,
          },
        })
      } catch (error: unknown) {
        set({
          error:
            error instanceof HTTPError
              ? error.message
              : "Failed to fetch WA templates",
        })
      } finally {
        set({ loading: false })
      }
    },

    setWaTemplates: (waTemplates: WhatsappMessageTemplateResource[]) =>
      set((state) => ({
        templates: { ...state.templates, waTemplates },
      })),
  }))
