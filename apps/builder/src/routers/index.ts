import aiAgentsAPI from "@/features/ai-agents/api"
import { aiMcpServerApi } from "@/features/ai-mcp-servers/api"
import botFieldsAPI from "@/features/bot-fields/api"
import contactsAPI from "@/features/contacts/api"
import conversationsAPI from "@/features/conversations/api"
import customFieldsAPI from "@/features/custom-fields/api"
import flowsAPI from "@/features/flows/api"
import tagsAPI from "@/features/tags/api"

export const router = {
  aiMcpServerApi,
  aiAgentsAPI,
  conversationsAPI,
  tagsAPI,
  customFieldsAPI,
  flowsAPI,
  contactsAPI,
  botFieldsAPI,
}
