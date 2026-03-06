import aiAgentsAPI from "@/features/ai-agents/api"
import { aiMcpServerApi } from "@/features/ai-mcp-servers/api"
import conversationsAPI from "@/features/conversations/api"
import tagsAPI from "@/features/tags/api"

export const router = {
  aiMcpServerApi,
  aiAgentsAPI,
  conversationsAPI,
  tagsAPI,
}
