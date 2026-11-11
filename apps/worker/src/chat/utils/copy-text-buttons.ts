import {
  buttonTypes,
  isCopyableText,
  isCopyTextButton,
  isNativeButtonType,
} from "@chatbotx.io/flow-config"
import type { SendFlowStepData } from "@chatbotx.io/sdk"
import { logger } from "../../lib/logger"
import { readStepButtons } from "./step-buttons"

/**
 * Logs every Copy Text button a channel that copies natively must send as a
 * reply instead, because its resolved text is empty or longer than the channel
 * copies. The button is not dropped (card button counts and carousel
 * signatures stay equal); `sendsAsNativeCopyButton` makes each encoder send it
 * as a reply, and the tap answers with the text. Runs after variables are
 * resolved, so the text is final.
 */
export const warnUncopyableCopyTextButtons = (props: {
  workspaceId: string
  flowId: string
  channel: string
  step: SendFlowStepData
}): void => {
  if (!isNativeButtonType(props.channel, buttonTypes.enum.copyText)) {
    return
  }

  for (const button of readStepButtons(props.step)) {
    if (isCopyTextButton(button) && !isCopyableText(button.beforeStep.text)) {
      logger.warn(
        {
          workspaceId: props.workspaceId,
          flowId: props.flowId,
          buttonId: button.id,
          textLength: button.beforeStep.text.length,
        },
        "Sending a Copy Text button as a reply: its text is empty or too long to copy",
      )
    }
  }
}
