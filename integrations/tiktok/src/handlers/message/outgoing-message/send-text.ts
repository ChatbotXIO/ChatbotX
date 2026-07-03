import type { SendTextStepSchema } from "@chatbotx.io/flow-config"
import type { SendFlowStepProps } from "@chatbotx.io/sdk"
import type { TiktokAuthValue, TiktokSendMessageRequest } from "../../../schema"
import {
  buildTiktokTemplates,
  buildTiktokTemplatesFromGroups,
  getButtonTemplateGroup,
  getCanonicalButtonTemplateGroup,
} from "./send-button"

export function* convertFlowStepText(
  businessId: string,
  props: SendFlowStepProps<TiktokAuthValue, SendTextStepSchema>,
): Generator<TiktokSendMessageRequest> {
  const {
    data: { step, contact, flowId, flowVersionId, metadata },
  } = props
  const quickReplies = props.data.quickReplies ?? []

  if (step.buttons.length === 0 && quickReplies.length === 0) {
    yield {
      business_id: businessId,
      recipient_type: "CONVERSATION",
      recipient: contact.sourceConversationId ?? contact.sourceId,
      message_type: "TEXT",
      text: { body: step.text },
    }
    return
  }

  const templates =
    quickReplies.length === 0
      ? buildTiktokTemplates({
          title: step.text,
          flowId,
          flowVersionId,
          buttons: step.buttons,
          metadata,
          contactInboxId: contact.id,
        })
      : buildTiktokTemplatesFromGroups({
          title: step.text,
          groups: [
            ...step.buttons.map((button) =>
              getButtonTemplateGroup({
                flowId,
                flowVersionId,
                button,
                metadata,
                contactInboxId: contact.id,
              }),
            ),
            ...quickReplies.map(getCanonicalButtonTemplateGroup),
          ],
        })

  for (const template of templates) {
    yield {
      business_id: businessId,
      recipient_type: "CONVERSATION",
      recipient: contact.sourceConversationId ?? contact.sourceId,
      message_type: "TEMPLATE",
      template,
    }
  }
}
