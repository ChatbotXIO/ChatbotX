import {
  encodeButtonPayload,
  type SendImageStepSchema,
} from "@aha.chat/flow-config"
import type { SendFlowStepProps } from "@aha.chat/sdk"
import { chunk } from "remeda"
import {
  ActionButtons,
  Body,
  Button,
  Header,
  Image,
  Interactive,
} from "whatsapp-api-js/messages"
import type { WhatsappAuthValue } from "../schemas"
import { MAX_BUTTONS } from "./shared"

export function* convertFlowStepImage(
  props: SendFlowStepProps<WhatsappAuthValue, SendImageStepSchema>,
) {
  const { step } = props
  if (step.buttons.length === 0) {
    yield new Image(step.url)
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
        new Body(""),
        new Header(new Image(step.url)),
      )
    }
  }
}
