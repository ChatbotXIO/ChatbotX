import {
  encodeButtonPayload,
  type SendTextStepSchema,
} from "@aha.chat/flow-config"
import type { SendFlowStepProps } from "@aha.chat/sdk"
import { chunk } from "remeda"
import {
  ActionButtons,
  Body,
  Button,
  Interactive,
  Text,
} from "whatsapp-api-js/messages"
import type { WhatsappAuthValue } from "../schemas"
import { MAX_BUTTONS } from "./shared"

export function* convertFlowStepText(
  props: SendFlowStepProps<WhatsappAuthValue, SendTextStepSchema>,
) {
  const { step } = props
  if (step.buttons.length === 0) {
    yield new Text(step.message)
  } else {
    const chunks = chunk(step.buttons, MAX_BUTTONS)

    for (const c1 of chunks) {
      const buttons = c1.map((button) => {
        const buttonId = encodeButtonPayload({
          flowId: props.flowId,
          flowVersionId: props.flowVersionId,
          buttonId: button.id,
        })
        return new Button(buttonId, button.label)
      })

      yield new Interactive(
        new ActionButtons(...(buttons as [Button, ...Button[]])),
        new Body(step.message),
      )
    }
  }
}
