import {
  Button,
  Text,
  Interactive,
  ActionButtons,
  Body,
} from "whatsapp-api-js/messages"
import type { SendTextStepSchema } from "@ahachat.ai/flow-config"
import { chunk } from "remeda"
import { MAX_BUTTONS } from "./shared"

export function* convertFlowStepText(
  flowVersionId: string,
  payload: SendTextStepSchema,
) {
  if (payload.buttons.length === 0) {
    yield new Text(payload.message)
  } else {
    const chunks = chunk(payload.buttons, MAX_BUTTONS)

    for (const chunk of chunks) {
      const buttons = chunk.map(
        (button) => new Button(`${flowVersionId}_${button.id}`, button.label),
      )

      yield new Interactive(
        new ActionButtons(...(buttons as [Button, ...Button[]])),
        new Body(payload.message),
      )
    }
  }
}
