import { analyticsRoutes } from "@chatbotx.io/analytics-nextjs/routes"
import aiAgentsAPI from "@/features/ai-agents/api"
import { aiMcpServerApi } from "@/features/ai-mcp-servers/api"
import botFieldsAPIs from "@/features/bot-fields/api"
import contactsAPIs from "@/features/contacts/api"
import conversationsAPI from "@/features/conversations/api"
import customFieldsAPI from "@/features/custom-fields/api"
import flowsAPI from "@/features/flows/api"
import { integrationWhatsappAPIs } from "@/features/integration-whatsapp/api"
import { whatsappMessageTemplateAPIs } from "@/features/integration-whatsapp/message-templates/api"
import savedRepliesAPI from "@/features/saved-replies/api"
import { sequencesAPI } from "@/features/sequences/api"
import tagsAPI from "@/features/tags/api"
import { chatbotAuthMiddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"

export const router = {
  aiMcpServerApi,
  aiAgentsAPI,
  conversationsAPI,
  tagsAPI,
  customFieldsAPI,
  flowsAPI,
  contactsAPIs,
  botFieldsAPIs,
  analyticsRoutes: authorizedAPI
    // @ts-expect-error
    .use(chatbotAuthMiddleware, (input) => input.chatbotId)
    .router(analyticsRoutes),
  integrationWhatsappAPIs,
  whatsappMessageTemplateAPIs,
  savedRepliesAPI,
  sequencesAPI,
}
