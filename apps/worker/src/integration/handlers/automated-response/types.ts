import type {
  AIAgentModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import type { ModelMessage, ToolSet } from "ai"

export type ReplyByAIProps = {
  conversation: ConversationModel
  lastAIMessages: ModelMessage[]
  aiAgent: AIAgentModel
  tools: ToolSet
  availableTools: {
    fileTools: string[]
    functionTools: string[]
    mcpTools: string[]
  }
}
