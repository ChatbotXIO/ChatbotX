import type { AIAgentModel } from "@chatbotx.io/database/types"
import type { OutgoingMessage } from "@chatbotx.io/sdk"
import type { ModelMessage, ToolSet } from "ai"

export type ReplyByAIProps = {
  message: OutgoingMessage
  lastAIMessages: ModelMessage[]
  aiAgent: AIAgentModel
  tools: ToolSet
  availableTools: {
    fileTools: string[]
    functionTools: string[]
    mcpTools: string[]
  }
}

export type SimilaritySearchResult = {
  id: bigint
  content: string
  aiFileId: bigint
  distance: number
}

export type FileSearchArgs = {
  query: string
}

export type FileSearchConfig = {
  chatbotId: bigint
  selectedFileIds: bigint[]
  similarityThreshold: number
  maxResults: number
}
