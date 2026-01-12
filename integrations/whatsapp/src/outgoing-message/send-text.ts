import {
  encodeButtonPayload,
  type SendTextStepSchema,
} from "@aha.chat/flow-config"
import { chunk } from "remeda"
import {
  ActionButtons,
  Body,
  Button,
  Interactive,
  Text,
} from "whatsapp-api-js/messages"
import { MAX_BUTTONS } from "./shared"

export function* convertFlowStepText(
  flowId: string,
  flowVersionId: string,
  payload: SendTextStepSchema,
) {
  if (payload.buttons.length === 0) {
    yield new Text(payload.message)
  } else {
    const chunks = chunk(payload.buttons, MAX_BUTTONS)

    for (const c1 of chunks) {
      const buttons = c1.map((button) => {
        const buttonId = encodeButtonPayload({
          flowId,
          flowVersionId,
          buttonId: button.id,
        })
        return new Button(buttonId, button.label)
      })

      yield new Interactive(
        new ActionButtons(...(buttons as [Button, ...Button[]])),
        new Body(payload.message),
      )
    }
  }
}
