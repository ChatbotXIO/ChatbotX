import { inboxTeamsWorkspaceTokenAPIs } from "@/enterprise/features/inbox-teams/api/workspace-token"
import aiAgentsWorkspaceTokenAPIs from "@/features/ai-agents/api/workspace-token"
import keywordsWorkspaceTokenAPIs from "@/features/automated-response/api/workspace-token"
import botFieldWorkspaceTokenAPIs from "@/features/bot-fields/api/workspace-token"
import { broadcastWorkspaceTokenAPIs } from "@/features/broadcasts/api/workspace-token"
import contactWorkspaceTokenAPIs from "@/features/contacts/api/workspace-token"
import conversationWorkspaceTokenAPIs from "@/features/conversations/api/workspace-token"
import customFieldWorkspaceTokenAPIs from "@/features/custom-fields/api/workspace-token"
import errorLogWorkspaceTokenAPIs from "@/features/error-logs/api/workspace-token"
import flowWorkspaceTokenAPIs from "@/features/flows/api/workspace-token"
import inboxWorkspaceTokenAPIs from "@/features/inboxes/api/workspace-token"
import whatsappMessageTemplateWorkspaceTokenAPIs from "@/features/integration-whatsapp/message-templates/api/workspace-token"
import integrationsWorkspaceTokenAPIs from "@/features/integrations/api/workspace-token"
import savedReplyWorkspaceTokenAPIs from "@/features/saved-replies/api/workspace-token"
import { sequencesWorkspaceTokenAPIs } from "@/features/sequences/api/workspace-token"
import { tagWorkspaceTokenAPIs } from "@/features/tags/api/token-auth"
import triggersWorkspaceTokenAPIs from "@/features/triggers/api/workspace-token"
import webhooksWorkspaceTokenAPIs from "@/features/webhooks/api/workspace-token"
import workspaceMembersAPIs from "@/features/workspace-members/api/workspace-token"
import workspaceAPIs from "@/features/workspaces/api/workspace-token"

export const publicRouter = {
  ...workspaceAPIs,
  ...inboxWorkspaceTokenAPIs,
  ...workspaceMembersAPIs,
  ...conversationWorkspaceTokenAPIs,
  ...savedReplyWorkspaceTokenAPIs,
  ...flowWorkspaceTokenAPIs,
  ...tagWorkspaceTokenAPIs,
  ...botFieldWorkspaceTokenAPIs,
  ...customFieldWorkspaceTokenAPIs,
  ...errorLogWorkspaceTokenAPIs,
  ...contactWorkspaceTokenAPIs,
  ...broadcastWorkspaceTokenAPIs,
  ...sequencesWorkspaceTokenAPIs,
  ...inboxTeamsWorkspaceTokenAPIs,
  ...whatsappMessageTemplateWorkspaceTokenAPIs,
  ...triggersWorkspaceTokenAPIs,
  ...webhooksWorkspaceTokenAPIs,
  ...aiAgentsWorkspaceTokenAPIs,
  ...keywordsWorkspaceTokenAPIs,
  ...integrationsWorkspaceTokenAPIs,
}
