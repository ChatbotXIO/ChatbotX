import {
  type ButtonStepProps,
  encodeButtonPayload,
  type SendQuickReplyStepSchema,
} from "@chatbotx.io/flow-config"
import type { SendFlowStepProps } from "@chatbotx.io/sdk"
import type {
  FacebookMessage,
  FacebookMessageAttachment,
  FacebookQuickReply,
  MessengerAuthValue,
} from "../../../schema"

export function* convertFlowStepQuickReply(
  props: SendFlowStepProps<MessengerAuthValue, SendQuickReplyStepSchema>,
): Generator<FacebookMessageAttachment | FacebookMessage> {
  const {
    data: { step },
  } = props
  if (step.buttons.length === 0) {
    yield {
      text: step.message,
    }
  } else {
    const buttons = convertFacebookQuickReplies({
      flowId: props.data.flowId,
      flowVersionId: props.data.flowVersionId,
      buttons: step.buttons,
    })

    yield {
      text: step.message,
      quick_replies: buttons,
    }
  }
}

export function convertFacebookQuickReplies(props: {
  flowId: string
  flowVersionId?: string
  buttons: ButtonStepProps[]
}): FacebookQuickReply[] {
  return props.buttons.map((button) => ({
    content_type: "text",
    title: button.label,
    payload: encodeButtonPayload({
      flowId: props.flowId,
      flowVersionId: props.flowVersionId,
      buttonId: button.id,
    }),
  }))
}
