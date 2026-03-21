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
  id: string
  content: string
  aiFileId: string
  distance: number
}

export type FileSearchArgs = {
  query: string
}

export type FileSearchConfig = {
  chatbotId: string
  selectedFileIds: string[]
  similarityThreshold: number
  maxResults: number
}

export type { AutomatedResponseReply } from "@chatbotx.io/database/types"
export type { SecretTextAuthValue } from "@chatbotx.io/sdk"
