import {
  type ButtonStepProps,
  encodeButtonPayload,
  type SendQuickReplyStepSchema,
} from "@chatbotx.io/flow-config"
import type { SendFlowStepProps } from "@chatbotx.io/sdk"
import type {
  InstagramAuthValue,
  InstagramMessageAttachment,
  InstagramQuickReply,
  InstagramSendMessage,
} from "../../../schemas"

export function* convertFlowStepQuickReply(
  props: SendFlowStepProps<InstagramAuthValue, SendQuickReplyStepSchema>,
): Generator<InstagramMessageAttachment | InstagramSendMessage> {
  const {
    data: { step },
  } = props
  if (step.buttons.length === 0) {
    yield {
      text: step.message,
    }
  } else {
    const buttons = convertInstagramQuickReplies({
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

export function convertInstagramQuickReplies(props: {
  flowId: string
  flowVersionId?: string
  buttons: ButtonStepProps[]
}): InstagramQuickReply[] {
  return props.buttons.map((button) => ({
    content_type: "text" as const,
    title: button.label,
    payload: encodeButtonPayload({
      flowId: props.flowId,
      flowVersionId: props.flowVersionId,
      buttonId: button.id,
    }),
  }))
}
