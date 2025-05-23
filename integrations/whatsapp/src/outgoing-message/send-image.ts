import {
  Button,
  Interactive,
  ActionButtons,
  Body,
  Image,
  Header,
} from "whatsapp-api-js/messages"
import type { SendImageStepSchema } from "@ahachat.ai/flow-config"
import { chunk } from "remeda"
import { MAX_BUTTONS } from "./shared"

export function* convertFlowStepImage(
  flowVersionId: string,
  payload: SendImageStepSchema,
) {
  if (payload.buttons.length === 0) {
    yield new Image(payload.url)
  } else {
    const chunks = chunk(payload.buttons, MAX_BUTTONS)

    for (const chunk of chunks) {
      const buttons = chunk.map(
        (button) => new Button(`${flowVersionId}_${button.id}`, button.label),
      )

      yield new Interactive(
        new ActionButtons(...(buttons as [Button, ...Button[]])),
        new Body(""),
        new Header(new Image(payload.url)),
      )
    }
  }
}
