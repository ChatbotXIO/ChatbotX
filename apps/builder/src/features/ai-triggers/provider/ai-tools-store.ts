import type {
  AIFileModel,
  AIFunctionModel,
  AIMCPServerModel,
} from "@aha.chat/database/types"
import ky, { HTTPError } from "ky"
import { createStore } from "zustand/vanilla"

export type AIToolsState = {
  loading: boolean
  error: string | null
  initialized: boolean

  chatbotId: string
  files: AIFileModel[]
  functions: AIFunctionModel[]
  mcpServers: AIMCPServerModel[]
}

export type AIToolsActions = {
  fetchTools: (chatbotId: string) => Promise<void>
  refetch: () => Promise<void>
}

export type AIToolsStore = AIToolsState & AIToolsActions

export const createAIToolsStore = () =>
  createStore<AIToolsStore>((set, get) => ({
    loading: false,
    error: null,
    initialized: false,

    chatbotId: "",
    files: [],
    functions: [],
    mcpServers: [],

    fetchTools: async (chatbotId: string) => {
      const {
        initialized,
        chatbotId: currentChatbotId,
        loading: isLoading,
      } = get()

      // Skip if already initialized for the same chatbotId or currently loading
      if (
        (initialized && currentChatbotId === chatbotId) ||
        isLoading ||
        !chatbotId
      ) {
        return
      }

      set({ loading: true, error: null, chatbotId })

      try {
        const [filesResp, functionsResp, mcpServersResp] = await Promise.all([
          ky
            .get<{ data: AIFileModel[] }>(`/api/chatbots/${chatbotId}/ai-files`)
            .json(),
          ky
            .get<{ data: AIFunctionModel[] }>(
              `/api/chatbots/${chatbotId}/ai-functions`,
            )
            .json(),
          ky
            .get<{ data: AIMCPServerModel[] }>(
              `/api/chatbots/${chatbotId}/ai-mcp-servers`,
            )
            .json(),
        ])

        set({
          files: filesResp?.data || [],
          functions: functionsResp?.data || [],
          mcpServers: mcpServersResp?.data || [],
          loading: false,
          initialized: true,
        })
      } catch (error: unknown) {
        if (error instanceof HTTPError) {
          set({
            error: error.message,
            loading: false,
          })
        } else {
          set({
            error: "Failed to fetch AI tools",
            loading: false,
          })
        }
        throw error
      }
    },

    refetch: async () => {
      const { chatbotId, loading } = get()
      if (chatbotId && !loading) {
        // Reset state to force refetch
        set({ initialized: false, error: null })
        await get().fetchTools(chatbotId)
      }
    },
  }))
