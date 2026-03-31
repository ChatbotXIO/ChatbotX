import type { AIAgentModel } from "@aha.chat/database/types"
import type { OutgoingMessage } from "@aha.chat/sdk"
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
