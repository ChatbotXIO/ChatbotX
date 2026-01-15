import {
  type ButtonStepProps,
  encodeButtonPayload,
  type SendQuickReplyStepSchema,
} from "@aha.chat/flow-config"
import type { SendFlowStepProps } from "@aha.chat/sdk"
import type {
  FacebookMessage,
  FacebookMessageAttachment,
  FacebookQuickReply,
  MessengerAuthValue,
} from "../schemas"

export function* convertFlowStepQuickReply(
  props: SendFlowStepProps<MessengerAuthValue, SendQuickReplyStepSchema>,
): Generator<FacebookMessageAttachment | FacebookMessage> {
  const { step } = props
  if (step.buttons.length === 0) {
    yield {
      text: step.message,
    }
  } else {
    const buttons = convertFacebookQuickReplies({
      flowId: props.flowId,
      flowVersionId: props.flowVersionId,
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
