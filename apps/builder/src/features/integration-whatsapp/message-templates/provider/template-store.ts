import { createStore } from "zustand/vanilla"
import { getClientErrorMessage } from "@/lib/orpc/client-error"
import { client } from "@/lib/orpc/orpc"
import type { WhatsappMessageTemplateResource } from "../schema/resource"

export type TemplateState = {
  loading: boolean
  error: string | null
  initialized: boolean

  workspaceId: string
  integrationWhatsappId?: string
  templates: WhatsappMessageTemplateResource[]
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

    workspaceId: "",
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
          error: getClientErrorMessage(error, "Failed to fetch templates"),
        })
      } finally {
        set({ initialized: true })
      }
    },

    getAllTemplates: async () => {
      const { workspaceId, integrationWhatsappId, loading } = get()

      if (loading || !workspaceId || !integrationWhatsappId) {
        if (!integrationWhatsappId) {
          set({ templates: [] })
        }
        return
      }

      try {
        set({ loading: true, error: null })

        const templates =
          await client.whatsappMessageTemplateAPIs.listWhatsappMessageTemplatesInternalAPI(
            {
              workspaceId,
              integrationWhatsappId,
            },
          )

        set({ templates })
      } catch (error: unknown) {
        set({
          error: getClientErrorMessage(error, "Failed to fetch templates"),
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
