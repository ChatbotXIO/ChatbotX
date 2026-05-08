import ky, { HTTPError } from "ky"
import { createStore } from "zustand/vanilla"
import type { ListWhatsappFlowsResponse } from "@/features/integration-whatsapp/flows/schema/query"

export type WhatsappFlowState = {
  error: string | null
  initialized: boolean

  workspaceId: string

  loadingWhatsappFlows: boolean
  whatsappFlows: ListWhatsappFlowsResponse
}

export type WhatsappFlowActions = {
  initialize: () => Promise<void>
  fetchWhatsappFlows: () => Promise<void>
}

export type WhatsappFlowStore = WhatsappFlowState & WhatsappFlowActions

export const createWhatsappFlowStore = (props: Partial<WhatsappFlowState>) =>
  createStore<WhatsappFlowStore>((set, get) => ({
    error: null,
    initialized: false,

    workspaceId: "",

    loadingWhatsappFlows: false,
    whatsappFlows: [],

    ...props,

    initialize: async () => {
      const { initialized, workspaceId, fetchWhatsappFlows } = get()

      if (initialized || !workspaceId) {
        return
      }

      try {
        await fetchWhatsappFlows()
      } catch (error: unknown) {
        set({
          error:
            error instanceof HTTPError
              ? error.message
              : "Failed to fetch WA flows",
        })
      } finally {
        set({ initialized: true })
      }
    },

    fetchWhatsappFlows: async () => {
      const { workspaceId, loadingWhatsappFlows } = get()

      if (loadingWhatsappFlows) {
        return
      }

      set({ loadingWhatsappFlows: true, error: null })
      try {
        const flows = await ky
          .get<ListWhatsappFlowsResponse>(
            `/api/workspaces/${workspaceId}/whatsapp-flows`,
          )
          .json()

        set({
          whatsappFlows: flows,
        })
      } catch (error: unknown) {
        set({
          error:
            error instanceof HTTPError
              ? error.message
              : "Failed to fetch WA flows",
        })
      } finally {
        set({ loadingWhatsappFlows: false })
      }
    },
  }))
