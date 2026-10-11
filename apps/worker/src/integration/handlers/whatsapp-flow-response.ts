import { whatsappFlowResponseService } from "@chatbotx.io/business"
import type { ContactInboxModel } from "@chatbotx.io/database/types"
import type { WhatsappFlowStepSchema } from "@chatbotx.io/flow-config"
import { logger } from "../../lib/logger"

export const applyWhatsappFlowResponseSideEffects = async (props: {
  workspaceId: string
  contactId: string
  contactInbox: ContactInboxModel
  step: WhatsappFlowStepSchema
  flowResponse: Record<string, unknown>
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
}
