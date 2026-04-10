import {
  type ButtonStepProps,
  ButtonType,
  encodeButtonPayload,
} from "@chatbotx.io/flow-config"
import { chunk } from "remeda"
import { MAX_BUTTONS } from "../../../constants"
import type { ButtonPayload } from "../../../schema/webhook"

export function getButtonTemplate(props: {
  flowId: string
  flowVersionId?: string
  button: ButtonStepProps
}): ButtonPayload {
  const { button } = props
  switch (button.buttonType) {
    case ButtonType.OpenWebsite:
      return {
        type: "oa.open.url",
        title: button.label,
        payload: {
          url: button.beforeStep.url,
        },
      }
    default:
      return {
        type: "oa.query.hide",
        title: button.label,
        payload: `postback_${encodeButtonPayload({
          flowId: props.flowId,
          flowVersionId: props.flowVersionId,
          buttonId: button.id,
        })}`,
      }
  }
}

export function convertZaloButtons(props: {
  flowId: string
  flowVersionId?: string
  buttons: ButtonStepProps[]
}): ButtonPayload[] | undefined {
  const chunks = chunk(props.buttons, MAX_BUTTONS)
  if (chunks.length > 0 && chunks[0]) {
    return chunks[0].map((button) =>
      getButtonTemplate({
        flowId: props.flowId,
        flowVersionId: props.flowVersionId,
        button,
      }),
    )
  }
}
