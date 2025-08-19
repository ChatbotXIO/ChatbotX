import type { SendImageStepSchema } from "@aha.chat/flow-config"
import { chunk } from "remeda"
import {
  ActionButtons,
  Body,
  Button,
  Header,
  Image,
  Interactive,
} from "whatsapp-api-js/messages"
import { MAX_BUTTONS } from "./shared"

export function* convertFlowStepImage(
  flowVersionId: string,
  payload: SendImageStepSchema,
) {
  if (payload.buttons.length === 0) {
    yield new Image(payload.url)
  } else {
    const chunks = chunk(payload.buttons, MAX_BUTTONS)

    for (const c1 of chunks) {
      const buttons = c1.map(
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
