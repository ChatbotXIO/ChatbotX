import {
  encodeButtonPayload,
  extractMetadata,
  WHATSAPP_FLOW_BUTTON_MAX,
  type WhatsappFlowStepSchema,
} from "@chatbotx.io/flow-config"
import type { MessageHandlers } from "@chatbotx.io/sdk"
import { ActionFlow, Interactive } from "whatsapp-api-js/messages"
import { WHATSAPP_FLOW_MESSAGE_VERSION } from "../../../constants"
import { logger } from "../../../lib/logger"
import type { WhatsappAuthValue } from "../../../schema"
import { generateBody } from "../interactive"

export function* convertFlowStepWhatsappFlow(
  props: Parameters<
    MessageHandlers<WhatsappAuthValue, WhatsappFlowStepSchema>["sendFlowStep"]
  >[0],
) {
  const {
    data: { step },
  } = props

  const button = step.buttons[0]
  if (!(button && step.flow.sourceId && step.flow.startScreenId)) {
    logger.warn(
      { stepId: step.id, flowId: step.flow.id },
      "whatsappFlow step skipped: missing button, sourceId, or startScreenId — flow may have been deleted from Meta",
    )
    return
  }

  const flowToken: string = encodeButtonPayload({
    flowId: props.data.flowId,
    flowVersionId: props.data.flowVersionId,
    buttonId: button.id,
    broadcastId: extractMetadata("broadcastId", props.data.metadata),
    sequenceStepId: extractMetadata("sequenceStepId", props.data.metadata),
  })

  const cta = button.label.trim().slice(0, WHATSAPP_FLOW_BUTTON_MAX)

  yield new Interactive(
    new ActionFlow({
      flow_message_version: WHATSAPP_FLOW_MESSAGE_VERSION,
      flow_id: step.flow.sourceId,
      flow_token: flowToken,
      flow_cta: cta,
      flow_action: "navigate",
      flow_action_payload: {
        screen: step.flow.startScreenId,
      },
    }),
    generateBody(step.text),
  )
}
