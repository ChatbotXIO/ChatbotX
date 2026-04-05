import { createStore } from "zustand/vanilla"
import { client } from "@/lib/orpc/orpc"

export type IntegrationWhatsapp = {
  id: string
  name: string
}

export type IntegrationState = {
  loading: boolean
  error: string | null
  initialized: boolean

  workspaceId: string
  integrations: IntegrationWhatsapp[]
}

export type IntegrationActions = {
  initialize: () => Promise<void>
  getAllIntegrations: () => Promise<void>
}

export type IntegrationStore = IntegrationState & IntegrationActions

export const createIntegrationStore = (props: Partial<IntegrationState>) =>
  createStore<IntegrationStore>((set, get) => ({
    loading: false,
    error: null,
    initialized: false,

    workspaceId: "",
    integrations: [],
    ...props,

    initialize: async () => {
      const { initialized } = get()

      if (initialized) {
        return
      }

      try {
        await get().getAllIntegrations()
      } catch (error: unknown) {
        set({
          error:
            error instanceof Error
              ? error.message
              : "Failed to fetch integrations",
        })
      } finally {
        set({ initialized: true })
      }
    },

    getAllIntegrations: async () => {
      const { workspaceId, loading } = get()

      if (loading || !workspaceId) {
        return
      }

      try {
        set({ loading: true, error: null })

        const integrations =
          await client.integrationWhatsappAPIs.listIntegrationWhatsapp({
            workspaceId,
          })

        set({ integrations })
      } catch (error: unknown) {
        set({
          error:
            error instanceof Error
              ? error.message
              : "Failed to fetch integrations",
          integrations: [],
        })
      } finally {
        set({ loading: false })
      }
    },
  }))
