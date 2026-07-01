import type { SendTextStepSchema } from "@chatbotx.io/flow-config"
import type { SendFlowStepProps } from "@chatbotx.io/sdk"
import type { TiktokAuthValue, TiktokSendMessageRequest } from "../../../schema"
import { buildTiktokTemplates } from "./send-button"

export function* convertFlowStepText(
  businessId: string,
  props: SendFlowStepProps<TiktokAuthValue, SendTextStepSchema>,
): Generator<TiktokSendMessageRequest> {
  const {
    data: { step, contact, flowId, flowVersionId, metadata },
  } = props
  const buttons = [...step.buttons, ...(props.data.quickReplies ?? [])]

  if (buttons.length === 0) {
    yield {
      business_id: businessId,
      recipient_type: "CONVERSATION",
      recipient: contact.sourceConversationId ?? contact.sourceId,
      message_type: "TEXT",
      text: { body: step.text },
    }
    return
  }

  for (const template of buildTiktokTemplates({
    title: step.text,
    flowId,
    flowVersionId,
    buttons,
    metadata,
    contactInboxId: contact.id,
  })) {
    yield {
      business_id: businessId,
      recipient_type: "CONVERSATION",
      recipient: contact.sourceConversationId ?? contact.sourceId,
      message_type: "TEMPLATE",
      template,
    }
  }
}
