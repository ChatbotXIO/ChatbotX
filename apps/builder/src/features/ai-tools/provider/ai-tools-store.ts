import { systemFunctionNames } from "@chatbotx.io/ai"
import ky, { HTTPError } from "ky"
import { createStore } from "zustand/vanilla"
import type { ListAIFilesResponse } from "@/features/ai-files/schemas"
import type { ListAIFunctionsResponse } from "@/features/ai-functions/schemas"
import type { ListAIMcpServersResponse } from "@/features/ai-mcp-servers/schemas"

type AIToolsState = {
  loadingAIFiles: boolean
  loadingAIFunctions: boolean
  loadingAIMCPServer: boolean
  error: string | null
  initialized: boolean

  workspaceId: string
  files: ListAIFilesResponse["data"]
  functions: ListAIFunctionsResponse["data"]
  mcpServers: ListAIMcpServersResponse["data"]
  systemFunctions: { id: string; name: string }[]
}

type AIToolsActions = {
  initialize: () => Promise<void>
  listAIFiles: () => Promise<void>
  listAIFunctions: () => Promise<void>
  listAIMcpServers: () => Promise<void>
}

export type AIToolsStore = AIToolsState & AIToolsActions

export const createAIToolsStore = (props: Pick<AIToolsState, "workspaceId">) =>
  createStore<AIToolsStore>((set, get) => ({
    loadingAIFiles: false,
    loadingAIFunctions: false,
    loadingAIMCPServer: false,
    error: null,
    initialized: false,

    workspaceId: props.workspaceId,
    files: [],
    functions: [],
    mcpServers: [],
    systemFunctions: [
      {
        id: systemFunctionNames.connectUserToHuman,
        name: systemFunctionNames.connectUserToHuman,
      },
    ],

    initialize: async () => {
      if (get().initialized) {
        return
      }

      await Promise.all([
        get().listAIFiles(),
        get().listAIFunctions(),
        get().listAIMcpServers(),
      ])

      set({ initialized: true })
    },

    listAIFiles: async () => {
      const { workspaceId, loadingAIFiles } = get()

      if (loadingAIFiles || !workspaceId) {
        return
      }

      set({ loadingAIFiles: true, error: null })

      try {
        const { data } = await ky
          .get<ListAIFilesResponse>(`/api/workspaces/${workspaceId}/ai-files`)
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
      const { workspaceId, loadingAIFunctions } = get()

      if (loadingAIFunctions || !workspaceId) {
        return
      }

      set({ loadingAIFunctions: true, error: null })

      try {
        const { data } = await ky
          .get<ListAIFunctionsResponse>(
            `/api/workspaces/${workspaceId}/ai-functions`,
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
        set({ loadingAIFunctions: false })
      }
    },

    listAIMcpServers: async () => {
      const { workspaceId, loadingAIMCPServer } = get()

      if (loadingAIMCPServer || !workspaceId) {
        return
      }

      set({ loadingAIMCPServer: true, error: null })

      try {
        const { data } = await ky
          .get<ListAIMcpServersResponse>(
            `/api/workspaces/${workspaceId}/ai-mcp-servers`,
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
