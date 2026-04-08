import { analyticsRoutes } from "@chatbotx.io/analytics-nextjs/routes"
import { inboxTeamsAPI } from "@/enterprise/features/inbox-teams/api"
import aiAgentsAPI from "@/features/ai-agents/api"
import { aiFilesAPI } from "@/features/ai-files/api"
import { aiFunctionsAPI } from "@/features/ai-functions/api"
import { aiMcpServerAPIs } from "@/features/ai-mcp-servers/api"
import botFieldsAPIs from "@/features/bot-fields/api"
import contactsAPIs from "@/features/contacts/api"
import { conversationsAPI } from "@/features/conversations/api"
import customFieldsAPI from "@/features/custom-fields/api"
import errorLogsAPI from "@/features/error-logs/api"
import flowsAPI from "@/features/flows/api"
import { foldersAPI } from "@/features/folders/api"
import { inboxesAPI } from "@/features/inboxes/api"
import { integrationWhatsappAPIs } from "@/features/integration-whatsapp/api"
import { whatsappMessageTemplateAPIs } from "@/features/integration-whatsapp/message-templates/api"
import { messagesAPI } from "@/features/messages/api"
import savedRepliesAPI from "@/features/saved-replies/api"
import { sequencesAPI } from "@/features/sequences/api"
import { spreadsheetsAPI } from "@/features/spreadsheets/api"
import tagsAPI from "@/features/tags/api"
import { workspaceMembersAPI } from "@/features/workspace-members/api"
import { workspacesAPI } from "@/features/workspaces/api"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"

export const router = {
  aiMcpServerAPIs,
  aiAgentsAPI,
  conversationsAPI,
  tagsAPI,
  customFieldsAPI,
  flowsAPI,
  contactsAPIs,
  botFieldsAPIs,
  analyticsRoutes: authorizedAPI
    // @ts-expect-error
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .router(analyticsRoutes),
  integrationWhatsappAPIs,
  whatsappMessageTemplateAPIs,
  savedRepliesAPI,
  sequencesAPI,
  aiFilesAPI,
  inboxesAPI,
  spreadsheetsAPI,
  workspaceMembersAPI,
  inboxTeamsAPI,
  foldersAPI,
  messagesAPI,
  errorLogsAPI,
  workspacesAPI,
  aiFunctionsAPI,
}
