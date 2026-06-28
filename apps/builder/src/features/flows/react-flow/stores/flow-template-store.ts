import {
  messengerTemplateStatusSchema,
  whatsappTemplateStatusSchema,
} from "@chatbotx.io/database/partials"
import ky, { HTTPError } from "ky"
import { createStore } from "zustand/vanilla"
import type { ListMessengerMessageTemplatesResponse } from "@/features/integration-messenger/message-templates/schema/query"
import type { ListWhatsappMessageTemplatesResponse } from "@/features/integration-whatsapp/message-templates/schema/query"
import type { ListMessengerPersonasResponse } from "@/features/personas/schemas/query"
import { client } from "@/lib/orpc/orpc"

export type FlowTemplateState = {
  error: string | null
  initialized: boolean

  workspaceId: string
  integrationWhatsappId?: string

  loadingWhatsappTemplates: boolean
  whatsappTemplates: ListWhatsappMessageTemplatesResponse

  loadingMessengerTemplates: boolean
  messengerTemplates: ListMessengerMessageTemplatesResponse

  loadingMessengerPersonas: boolean
  messengerPersonas: ListMessengerPersonasResponse["data"]
}

export type FlowTemplateActions = {
  initialize: () => Promise<void>
  fetchWhatsappTemplates: () => Promise<void>
  fetchMessengerTemplates: () => Promise<void>
  fetchMessengerPersonas: () => Promise<void>
  setIntegrationWhatsappId: (id?: string) => void
}

export type FlowTemplateStore = FlowTemplateState & FlowTemplateActions

export const createFlowTemplateStore = (props: Partial<FlowTemplateState>) => {
  // Per-instance AbortController so rapid setIntegrationWhatsappId calls
  // cancel the previous in-flight WA fetch instead of queuing retries.
  let waFetchController: AbortController | null = null
  // Closure-level flags to deduplicate concurrent Messenger fetches.
  let messengerFetching = false
  let messengerPersonasFetching = false

  return createStore<FlowTemplateStore>((set, get) => ({
    error: null,
    initialized: false,

    workspaceId: "",
    integrationWhatsappId: undefined,

    loadingWhatsappTemplates: false,
    whatsappTemplates: [],

    loadingMessengerTemplates: false,
    messengerTemplates: [],

    loadingMessengerPersonas: false,
    messengerPersonas: [],

    ...props,

    initialize: async () => {
      const {
        initialized,
        workspaceId,
        fetchWhatsappTemplates,
        fetchMessengerTemplates,
        fetchMessengerPersonas,
      } = get()

      if (initialized || !workspaceId) {
        return
      }

      // Individual fetch methods manage their own error state via set({ error }).
      // No outer catch needed — always mark initialized so the provider does not retry.
      await Promise.all([
        fetchWhatsappTemplates(),
        fetchMessengerTemplates(),
        fetchMessengerPersonas(),
      ])
      set({ initialized: true })
    },

    fetchWhatsappTemplates: async () => {
      const { workspaceId, integrationWhatsappId } = get()

      if (!workspaceId) {
        return
      }

      // Cancel any prior in-flight WA fetch; the new request supersedes it.
      waFetchController?.abort()
      const controller = new AbortController()
      waFetchController = controller
      const { signal } = controller

      set({ loadingWhatsappTemplates: true, error: null })
      try {
        const searchParams: Record<string, string> = {
          status: whatsappTemplateStatusSchema.enum.APPROVED,
        }
        if (integrationWhatsappId) {
          searchParams.integrationWhatsappId = integrationWhatsappId
        }

        const templates = await ky
          .get<ListWhatsappMessageTemplatesResponse>(
            `/api/workspaces/${workspaceId}/whatsapp-message-templates`,
            { searchParams, signal },
          )
          .json()

        set({ whatsappTemplates: templates, loadingWhatsappTemplates: false })
      } catch (error: unknown) {
        if (error instanceof Error && error.name === "AbortError") {
          // A newer fetch superseded this one. Only clear loading if no newer
          // fetch has since taken over (e.g. store abandoned on unmount).
          if (waFetchController === controller) {
            set({ loadingWhatsappTemplates: false })
          }
          return
        }
        set({
          error:
            error instanceof HTTPError
              ? error.message
              : "Failed to fetch WA templates",
          whatsappTemplates: [],
          loadingWhatsappTemplates: false,
        })
      }
    },

    fetchMessengerTemplates: async () => {
      const { workspaceId } = get()

      if (!workspaceId || messengerFetching) {
        return
      }

      messengerFetching = true
      set({ loadingMessengerTemplates: true, error: null })
      try {
        const templates = await ky
          .get<ListMessengerMessageTemplatesResponse>(
            `/api/workspaces/${workspaceId}/messenger-message-templates`,
            {
              searchParams: {
                status: messengerTemplateStatusSchema.enum.APPROVED,
              },
            },
          )
          .json()

        set({
          messengerTemplates: templates,
        })
      } catch (error: unknown) {
        set({
          error:
            error instanceof HTTPError
              ? error.message
              : "Failed to fetch Messenger templates",
        })
      } finally {
        messengerFetching = false
        set({ loadingMessengerTemplates: false })
      }
    },

    fetchMessengerPersonas: async () => {
      const { workspaceId } = get()

      if (!workspaceId || messengerPersonasFetching) {
        return
      }

      messengerPersonasFetching = true
      set({ loadingMessengerPersonas: true, error: null })
      try {
        const { data } =
          await client.personasAPIs.listMessengerPersonasAuthenticatedAPI({
            workspaceId,
          })

        set({ messengerPersonas: data })
      } catch (error: unknown) {
        set({
          error:
            error instanceof HTTPError
              ? error.message
              : "Failed to fetch Messenger personas",
        })
      } finally {
        messengerPersonasFetching = false
        set({ loadingMessengerPersonas: false })
      }
    },

    setIntegrationWhatsappId: (id?: string) => {
      set({ integrationWhatsappId: id, whatsappTemplates: [] })
      get().fetchWhatsappTemplates()
    },
  }))
}
