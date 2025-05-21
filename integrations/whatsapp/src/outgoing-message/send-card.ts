import type { ILogObj, Logger } from "tslog"
import {
  ActionButtons,
  type Button,
  Header,
  Image,
  Interactive,
  Text,
} from "whatsapp-api-js/messages"
import { generateBody, generateButton, generateFooter } from "../interactive"

export const INTERACTIVE_MAX_BUTTONS_COUNT = 3

export type SendCardPayload = {
  title: string
  subtitle?: string
  image?: { url: string }
  buttons?: { id: string; label: string }[]
}

export function* generateOutgoingMessages(
  flowVersionId: string,
  payload: SendCardPayload,
  logger: Logger<ILogObj>,
) {
  if (!payload.buttons?.length) {
    if (payload.image?.url) {
      yield new Image(payload.image.url)
    }
    if (payload.title) {
      yield new Text(payload.title)
    }
    if (payload.subtitle) {
      yield new Text(payload.subtitle)
    }
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
        generateBody(payload.title),
        payload.image ? new Header(new Image(payload.image.url)) : undefined,
        payload.subtitle ? generateFooter(payload.subtitle) : undefined,
      )
    }
  }
}
