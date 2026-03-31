import ky, { HTTPError } from "ky"
import { createStore } from "zustand/vanilla"
import type { ListAIFilesResponse } from "@/features/ai-files/schemas"
import type { ListAIFunctionsResponse } from "@/features/ai-functions/schema/action"
import type { ListAIMcpServersResponse } from "@/features/ai-mcp-servers/schema/action"

export type AIToolsState = {
  loadingAIFiles: boolean
  loadingAIFunction: boolean
  loadingAIMCPServer: boolean
  error: string | null
  initialized: boolean

  chatbotId: string
  files: ListAIFilesResponse["data"]
  functions: ListAIFunctionsResponse["data"]
  mcpServers: ListAIMcpServersResponse["data"]
}

export type AIToolsActions = {
  initialize: () => Promise<void>
  listAIFiles: () => Promise<void>
  listAIFunctions: () => Promise<void>
  getAIMCPServers: () => Promise<void>
}

export type AIToolsStore = AIToolsState & AIToolsActions

export const createAIToolsStore = (props: Partial<AIToolsState>) =>
  createStore<AIToolsStore>((set, get) => ({
    loadingAIFiles: false,
    loadingAIFunction: false,
    loadingAIMCPServer: false,
    error: null,
    initialized: false,

    chatbotId: "",
    files: [],
    functions: [],
    mcpServers: [],
    ...props,

    initialize: async () => {
      const { initialized } = get()

      // Skip if already initialized for the same chatbotId or currently loading
      if (initialized) {
        return
      }

      try {
        await Promise.all([
          get().listAIFiles(),
          get().listAIFunctions(),
          get().getAIMCPServers(),
        ])
      } catch (error: unknown) {
        set({
          error:
            error instanceof HTTPError
              ? error.message
              : "Failed to fetch AI tools",
        })
      } finally {
        set({ initialized: true })
      }
    },

    listAIFiles: async () => {
      const { chatbotId, loadingAIFiles } = get()

      if (loadingAIFiles || !chatbotId) {
        return
      }

      set({ loadingAIFiles: true, error: null })

      try {
        const { data } = await ky
          .get<ListAIFilesResponse>(`/api/chatbots/${chatbotId}/ai-files`)
          .json()

        set({ files: data })
      } catch (error: unknown) {
        set({
          error:
            error instanceof HTTPError
              ? error.message
              : "Failed to fetch AI files",
        })
      } finally {
        set({ loadingAIFiles: false })
      }
    },

    listAIFunctions: async () => {
      const { chatbotId, loadingAIFunction } = get()

      if (loadingAIFunction || !chatbotId) {
        return
      }

      set({ loadingAIFunction: true, error: null })

      try {
        const { data } = await ky
          .get<ListAIFunctionsResponse>(
            `/api/chatbots/${chatbotId}/ai-functions`,
          )
          .json()

        set({ functions: data })
      } catch (error: unknown) {
        set({
          error:
            error instanceof HTTPError
              ? error.message
              : "Failed to fetch AI functions",
        })
      } finally {
        set({ loadingAIFunction: false })
      }
    },

    getAIMCPServers: async () => {
      const { chatbotId, loadingAIMCPServer } = get()

      if (loadingAIMCPServer || !chatbotId) {
        return
      }

      set({ loadingAIMCPServer: true, error: null })

      try {
        const { data } = await ky
          .get<ListAIMcpServersResponse>(
            `/api/chatbots/${chatbotId}/ai-mcp-servers`,
          )
          .json()

        set({ mcpServers: data })
      } catch (error: unknown) {
        set({
          error:
            error instanceof HTTPError
              ? error.message
              : "Failed to fetch AI MCP servers",
        })
      } finally {
        set({ loadingAIMCPServer: false })
      }
    },
  }))
