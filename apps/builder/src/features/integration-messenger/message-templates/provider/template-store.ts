import { createStore } from "zustand/vanilla"
import { getClientErrorMessage } from "@/lib/orpc/client-error"
import { client } from "@/lib/orpc/orpc"
import type { MessengerMessageTemplateResource } from "../schema/resource"

export type MessengerTemplateState = {
  loading: boolean
  error: string | null
  initialized: boolean

  workspaceId: string
  integrationMessengerId?: string
  templates: MessengerMessageTemplateResource[]
}

export type MessengerTemplateActions = {
  initialize: () => Promise<void>
  getAllTemplates: () => Promise<void>
  setIntegrationMessengerId: (id?: string) => void
}

export type MessengerTemplateStore = MessengerTemplateState &
  MessengerTemplateActions

export const createMessengerTemplateStore = (
  props: Partial<MessengerTemplateState>,
) =>
  createStore<MessengerTemplateStore>((set, get) => ({
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
      const { workspaceId, integrationMessengerId, loading } = get()

      if (loading || !workspaceId || !integrationMessengerId) {
        if (!integrationMessengerId) {
          set({ templates: [] })
        }
        return
      }

      try {
        set({ loading: true, error: null })

        const templates =
          await client.messengerMessageTemplateAPIs.listMessengerMessageTemplatesInternalAPI(
            {
              workspaceId,
              integrationMessengerId,
              status: "APPROVED",
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

    setIntegrationMessengerId: (id?: string) => {
      set({ integrationMessengerId: id })
      get().getAllTemplates()
    },
  }))
