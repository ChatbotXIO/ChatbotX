import { HTTPError } from "ky"
import { createStore } from "zustand/vanilla"
import { getTemplatesForFlow } from "@/features/integration-whatsapp/message-templates/actions/get-templates-for-flow"

export type FlowActionState = {
  loading: boolean
  error: string | null
  initialized: boolean

  workspaceId: string
  data: Record<string, unknown>
  beforeStep?: { channel?: string; [key: string]: unknown }
}

export type FlowActionActions = {
  initialize: () => Promise<void>
  fetchWaTemplates: () => Promise<void>
  setData: (data: Record<string, unknown>) => void
}

export type FlowActionStore = FlowActionState & FlowActionActions

export const createFlowActionStore = (props: Partial<FlowActionState>) =>
  createStore<FlowActionStore>((set, get) => ({
    loading: false,
    error: null,
    initialized: false,

    workspaceId: "",
    data: {},
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
        const templates = await getTemplatesForFlow(workspaceId)
        const waTemplates = templates.map((t) => ({
          id: t.id,
          name: t.name,
          language: t.language,
        }))

        set({
          data: {
            ...get().data,
            "wa.templates": waTemplates,
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

    setData: (data) => set({ data }),
  }))
