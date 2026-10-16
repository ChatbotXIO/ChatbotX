import {
  resolveTemplateFlowButton,
  whatsappFlowResponseService,
} from "@chatbotx.io/business"
import { decodeTemplateFlowToken } from "@chatbotx.io/flow-config"
import type { IntegrationJobCaptureTemplateFlowResponse } from "@chatbotx.io/worker-config"
import { detectConversationAndContactInbox } from "../../lib/db"
import { logger } from "../../lib/logger"
import { awardWhatsappFlowSurvey } from "./whatsapp-flow-response"

export async function captureTemplateFlowResponse(
  data: IntegrationJobCaptureTemplateFlowResponse["data"],
): Promise<void> {
  const token = decodeTemplateFlowToken(data.templateFlowToken)
  if (!token) {
    logger.warn(
      { workspaceId: data.workspaceId, messageId: data.messageId },
      "[template-flow-response] invalid token",
    )
    return
  }

  const { conversation, contactInbox } =
    await detectConversationAndContactInbox({
      conversationId: data.conversationId,
      contactInboxId: data.contactInboxId,
    })

  if (conversation.workspaceId !== data.workspaceId) {
    logger.warn(
      {
        workspaceId: data.workspaceId,
        conversationWorkspaceId: conversation.workspaceId,
        conversationId: conversation.id,
        contactInboxId: contactInbox.id,
        messageId: data.messageId,
      },
      "[template-flow-response] workspace mismatch",
    )
    return
  }

  const resolved = await resolveTemplateFlowButton(token, {
    workspaceId: data.workspaceId,
    inboxId: contactInbox.inboxId,
  })
  if (!resolved) {
    return
  }

  await whatsappFlowResponseService.applyResponse({
    workspaceId: data.workspaceId,
    contactId: conversation.contactId,
    contactInbox,
    integrationWhatsappId: resolved.integrationWhatsappId,
    flowSourceId: resolved.flowSourceId,
    fieldMappings: resolved.param.fieldMappings ?? [],
    flowResponse: data.flowResponse,
  })

  await awardWhatsappFlowSurvey({
    workspaceId: data.workspaceId,
    contactId: conversation.contactId,
    contactInbox,
    messageId: data.messageId,
  })
}
