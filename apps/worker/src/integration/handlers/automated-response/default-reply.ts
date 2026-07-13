import { flowService } from "@chatbotx.io/business"
import type {
  ContactInboxModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import { webhookChannelOrigin } from "@chatbotx.io/events/context"
import {
  type BotResponseTrackingContext,
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { logger } from "../../../lib/logger"

export async function triggerDefaultReplyFlow(props: {
  workspaceId: string
  defaultReplyFlowId: string | null | undefined
  conversation: ConversationModel
  contactInbox: ContactInboxModel
  trackingContext?: BotResponseTrackingContext
}): Promise<boolean> {
  const {
    workspaceId,
    defaultReplyFlowId,
    conversation,
    contactInbox,
    trackingContext,
  } = props

  if (!defaultReplyFlowId) {
    return false
  }

  const flow = await flowService.findBy({
    workspaceId,
    id: defaultReplyFlowId,
  })

  if (!(flow?.active && flow.currentVersionId)) {
    logger.warn(
      { workspaceId, defaultReplyFlowId },
      "[default-reply] configured default reply flow is missing, inactive, or has no published version",
    )
    return false
  }

  await integrationQueue.add(IntegrationJobAction.sendFlow, {
    type: IntegrationJobAction.sendFlow,
    data: {
      conversationId: conversation.id,
      contactInboxId: contactInbox.id,
      flowId: flow.id,
      origin: webhookChannelOrigin(),
      trackingContext,
    },
  })

  return true
}
