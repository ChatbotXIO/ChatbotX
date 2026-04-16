import {
  encodeButtonPayload,
  extractMetadata,
  type SendImageStepSchema,
} from "@chatbotx.io/flow-config"
import type { MessageHandlers } from "@chatbotx.io/sdk"
import { chunk } from "remeda"
import {
  ActionButtons,
  Body,
  Button,
  Header,
  Image,
  Interactive,
} from "whatsapp-api-js/messages"
import type { WhatsappAuthValue } from "../../../schema"
import { MAX_BUTTONS } from "./shared"

export function* convertFlowStepImage(
  props: Parameters<
    MessageHandlers<WhatsappAuthValue, SendImageStepSchema>["sendFlowStep"]
  >[0],
) {
  const {
    data: { step },
  } = props
  if (step.buttons.length === 0) {
    yield new Image(step.url)
  } else {
    const chunks = chunk(step.buttons, MAX_BUTTONS)

    for (const c1 of chunks) {
      const buttons = c1.map((button) => {
        const buttonId = encodeButtonPayload({
          flowId: props.data.flowId,
          flowVersionId: props.data.flowVersionId,
          buttonId: button.id,
          broadcastId: extractMetadata("broadcastId", props.data.metadata),
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
