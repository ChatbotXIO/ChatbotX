import {
  encodeButtonPayload,
  extractMetadata,
  type SendTextStepSchema,
} from "@chatbotx.io/flow-config"
import type { MessageHandlers } from "@chatbotx.io/sdk"
import { chunk } from "remeda"
import {
  ActionButtons,
  Body,
  Button,
  Interactive,
  Text,
} from "whatsapp-api-js/messages"
import type { WhatsappAuthValue } from "../../../schema"
import { MAX_BUTTONS } from "./shared"

export function* convertFlowStepText(
  props: Parameters<
    MessageHandlers<WhatsappAuthValue, SendTextStepSchema>["sendFlowStep"]
  >[0],
) {
  const {
    data: { step },
  } = props
  if (step.buttons.length === 0) {
    yield new Text(step.text)
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
        new Body(step.text),
      )
    }
  }
}
