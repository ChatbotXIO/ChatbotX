import type {
  AIFileModel,
  AIFunctionModel,
  AIMCPServerModel,
} from "@aha.chat/database/types"
import ky, { HTTPError } from "ky"
import { createStore } from "zustand/vanilla"
import type { AIFileCollection } from "@/features/ai-files/schemas"
import type { AIFunctionCollection } from "@/features/ai-functions/schemas"
import type { AIMcpServerCollection } from "@/features/ai-mcp-servers/schemas"

export type AIToolsState = {
  loadingAIFiles: boolean
  loadingAIFunction: boolean
  loadingAIMCPServer: boolean
  error: string | null
  initialized: boolean

  chatbotId: string
  files: AIFileModel[]
  functions: AIFunctionModel[]
  mcpServers: AIMCPServerModel[]
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
          .get<AIFileCollection>(`/api/chatbots/${chatbotId}/ai-files`)
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
          .get<AIFunctionCollection>(`/api/chatbots/${chatbotId}/ai-functions`)
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
          .get<AIMcpServerCollection>(
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
