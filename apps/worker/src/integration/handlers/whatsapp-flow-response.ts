import { whatsappFlowResponseService } from "@chatbotx.io/business"
import { enqueueLeaderboardAward } from "@chatbotx.io/business/leaderboard"
import type { ContactInboxModel } from "@chatbotx.io/database/types"
import type { WhatsappFlowStepSchema } from "@chatbotx.io/flow-config"
import { createdAtFromId } from "@chatbotx.io/utils"
import { logger } from "../../lib/logger"

/**
 * A submitted WhatsApp Flow form counts as a completed survey for WhatsApp
 * leaderboards. The stored response message is the source event: its id is
 * the sourceRef and the time packed into that id the event time, so a retry
 * or redelivery scores once.
 */
export const awardWhatsappFlowSurvey = async (props: {
  workspaceId: string
  contactId: string
  contactInbox: Pick<ContactInboxModel, "channel" | "inboxId">
  messageId: string | null | undefined
}): Promise<void> => {
  if (props.contactInbox.channel !== "whatsapp" || !props.messageId) {
    return
  }
  const eventAt = createdAtFromId(props.messageId)
  if (!eventAt) {
    return
  }
  await enqueueLeaderboardAward({
    workspaceId: props.workspaceId,
    contactId: props.contactId,
    inboxId: props.contactInbox.inboxId,
    rule: "survey",
    sourceRef: `waflow:${props.messageId}`,
    eventAt,
  })
}

export const applyWhatsappFlowResponseSideEffects = async (props: {
  workspaceId: string
  contactId: string
  contactInbox: ContactInboxModel
  step: WhatsappFlowStepSchema
  flowResponse: Record<string, unknown>
  /** The stored flow-response message; scores the WhatsApp "survey" rule. */
  messageId?: string | null
}) => {
  const flowSourceId = props.step.flow.sourceId
  if (!flowSourceId) {
    logger.warn(
      { flowId: props.step.flow.id },
      "[whatsapp-flow-response] step.flow.sourceId missing",
    )
    return
  }

  await whatsappFlowResponseService.applyResponse({
    workspaceId: props.workspaceId,
    contactId: props.contactId,
    contactInbox: props.contactInbox,
    flowSourceId,
    fieldMappings: props.step.flow.fieldMappings,
    flowResponse: props.flowResponse,
  })

  await awardWhatsappFlowSurvey({
    workspaceId: props.workspaceId,
    contactId: props.contactId,
    contactInbox: props.contactInbox,
    messageId: props.messageId,
  })
}
