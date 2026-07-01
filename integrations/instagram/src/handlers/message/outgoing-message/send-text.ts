import type { SendTextStepSchema } from "@chatbotx.io/flow-config"
import type { SendFlowStepProps } from "@chatbotx.io/sdk"
import type {
  InstagramAuthValue,
  InstagramMessageAttachment,
  InstagramSendMessage,
} from "../../../schemas"
import { convertInstagramButtons } from "./send-button"
import { convertInstagramQuickReplies } from "./send-quick-reply"

export function* convertFlowStepText(
  props: SendFlowStepProps<InstagramAuthValue, SendTextStepSchema>,
): Generator<InstagramMessageAttachment | InstagramSendMessage> {
  const {
    data: { step },
  } = props
  if (step.buttons.length === 0) {
    const quickReplies = props.data.quickReplies ?? []
    if (quickReplies.length > 0) {
      yield {
        text: step.text,
        quick_replies: convertInstagramQuickReplies({
          flowId: props.data.flowId,
          flowVersionId: props.data.flowVersionId,
          buttons: quickReplies,
        }),
      }
      return
    }
    yield {
      text: step.text,
    }
  } else {
    const buttons = convertInstagramButtons({
      flowId: props.data.flowId,
      flowVersionId: props.data.flowVersionId,
      buttons: step.buttons,
    })

    yield {
      attachment: {
        type: "template",
        payload: {
          template_type: "button",
          text: step.text,
          buttons,
        },
      },
    }
  }
}
