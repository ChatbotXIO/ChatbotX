import {
  Text,
  Interactive,
  ActionButtons,
  type Button,
} from "whatsapp-api-js/messages"
import { chunkArray } from "../util"
import type { ILogObj, Logger } from "tslog"
import { generateBody, generateButton } from "../interactive"

export const INTERACTIVE_MAX_BUTTONS_COUNT = 3

export function* generateOutgoingMessages(
  flowVersionId: string,
  payload: { message: string; buttons: { id: string; label: string }[] },
  logger: Logger<ILogObj>,
) {
  if (payload.buttons.length === 0) {
    yield new Text(payload.message)
  } else {
    const chunks = chunkArray(payload.buttons, INTERACTIVE_MAX_BUTTONS_COUNT)

    if (payload.buttons.length > INTERACTIVE_MAX_BUTTONS_COUNT) {
      logger.info(
        `Splitting ${payload.buttons.length} buttons into groups of ${INTERACTIVE_MAX_BUTTONS_COUNT} buttons each due to a limitation of Whatsapp.`,
      )
    }

    for (const chunk of chunks) {
      const buttons: Button[] = chunk.map((button) =>
        generateButton({
          id: `${flowVersionId}-${button.id}`,
          title: button.label,
        }),
      )
      yield new Interactive(
        new ActionButtons(...buttons),
        generateBody(payload.message),
      )
    }
  }
}
