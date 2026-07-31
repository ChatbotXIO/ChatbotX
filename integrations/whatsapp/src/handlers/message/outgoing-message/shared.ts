import {
  type ButtonStepProps,
  encodeButtonPayload,
  extractMetadata,
  type MetadataPayload,
} from "@chatbotx.io/flow-config"
import {
  getCanonicalReplyPayload,
  type MessageButtonTemplate,
} from "@chatbotx.io/sdk"
import {
  ActionButtons,
  ActionList,
  type Footer,
  Header,
  type Image,
  Interactive,
  ListSection,
  Text,
} from "whatsapp-api-js/messages"
import type { ClientMessage } from "whatsapp-api-js/types"
import { logger } from "../../../lib/logger"
import { generateBody, generateButton, generateRow } from "../interactive"
import { clampText, messageLimits, splitText } from "../message-limits"

export const MAX_BUTTONS = 3
export const MAX_LIST_ROWS = 10
export const DEFAULT_LIST_BUTTON_LABEL = "Options"

/**
 * A reply is deduplicated on the *strictest* clamp of either layout, because
 * two labels that only differ past the reply-button limit would collide again
 * after `generateButton` truncates them.
 */
const UNIQUE_ID_LENGTH = Math.min(messageLimits.buttonId, messageLimits.rowId)
const UNIQUE_LABEL_LENGTH = Math.min(
  messageLimits.buttonTitle,
  messageLimits.rowTitle,
)

type WhatsappReplyButton = {
  id: string
  label: string
}

/**
 * `contactInboxId` only reaches the payload of a link button, whose code is read
 * back by the magic-link redirect route. A reply comes in through the webhook,
 * which resolves the conversation itself, so it is left out there to keep the id
 * inside Meta's 256-character limit.
 */
export function normalizeRawButton(props: {
  flowId: string
  flowVersionId?: string
  button: ButtonStepProps
  metadata?: MetadataPayload
  contactInboxId?: string
}): WhatsappReplyButton {
  const { flowId, flowVersionId, button, metadata, contactInboxId } = props

  return {
    id: encodeButtonPayload({
      flowId,
      flowVersionId,
      buttonId: button.id,
      broadcastId: extractMetadata("broadcastId", metadata),
      sequenceStepId: extractMetadata("sequenceStepId", metadata),
      contactInboxId,
    }),
    label: button.label,
  }
}

function normalizeCanonicalQuickReply(
  button: MessageButtonTemplate,
): WhatsappReplyButton {
  return {
    id: getCanonicalReplyPayload(button),
    label: button.label,
  }
}

/**
 * Meta identifies a reply by both its id and its visible title, and
 * `ActionButtons` throws when either repeats — which would abort the whole flow
 * step. Step buttons and node quick replies are authored independently, so a
 * collision between the two lists is expected rather than exceptional.
 *
 * Blank labels are dropped for the same reason: `Button` rejects an empty title.
 */
function dedupeReplyButtons(
  buttons: WhatsappReplyButton[],
): WhatsappReplyButton[] {
  const seenIds = new Set<string>()
  const seenLabels = new Set<string>()

  return buttons.filter(({ id, label }) => {
    const uniqueId = clampText(id, UNIQUE_ID_LENGTH)
    const uniqueLabel = clampText(label, UNIQUE_LABEL_LENGTH)

    if (!uniqueLabel || seenIds.has(uniqueId) || seenLabels.has(uniqueLabel)) {
      return false
    }

    seenIds.add(uniqueId)
    seenLabels.add(uniqueLabel)
    return true
  })
}

function selectReplyButtons(props: {
  flowId: string
  flowVersionId?: string
  buttons: ButtonStepProps[]
  quickReplies?: MessageButtonTemplate[]
  metadata?: MetadataPayload
}): WhatsappReplyButton[] {
  const selected = dedupeReplyButtons([
    ...props.buttons.map((button) =>
      normalizeRawButton({
        flowId: props.flowId,
        flowVersionId: props.flowVersionId,
        button,
        metadata: props.metadata,
      }),
    ),
    ...(props.quickReplies ?? []).map(normalizeCanonicalQuickReply),
  ])

  const requested = props.buttons.length + (props.quickReplies?.length ?? 0)

  if (selected.length < requested) {
    logger.warn(
      { requested, sent: selected.length },
      "Dropped WhatsApp replies that were unlabelled or duplicated",
    )
  }

  return selected
}

function chunkList<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, index * size + size),
  )
}

/**
 * Builds the message sequence that carries `bodyText`, an optional image and a
 * set of replies.
 *
 * Nothing is discarded to fit a WhatsApp limit: overflowing text and overflowing
 * replies each become additional messages. Only values with nowhere to overflow
 * to — a button title, a footer — are clamped.
 */
export function buildWhatsappButtonMessages(props: {
  flowId: string
  flowVersionId?: string
  buttons: ButtonStepProps[]
  quickReplies?: MessageButtonTemplate[]
  metadata?: MetadataPayload
  bodyText: string
  media?: Image
  footer?: Footer
}): ClientMessage[] {
  const replies = selectReplyButtons({
    flowId: props.flowId,
    flowVersionId: props.flowVersionId,
    buttons: props.buttons,
    quickReplies: props.quickReplies,
    metadata: props.metadata,
  })

  if (replies.length === 0) {
    return []
  }

  // Only the closing chunk becomes the interactive body; anything before it
  // leads as plain text so a long message keeps all of its content.
  const bodyChunks = splitText(props.bodyText, messageLimits.bodyText)
  const bodyText = bodyChunks.at(-1) ?? ""
  const leading: ClientMessage[] = bodyChunks
    .slice(0, -1)
    .map((chunk) => new Text(chunk))

  // Reply buttons can carry the image inline, which reads best when it all fits.
  if (replies.length <= MAX_BUTTONS) {
    const [firstButton, ...restButtons] = replies.map(({ id, label }) =>
      generateButton({ id, title: label }),
    )

    return [
      ...leading,
      new Interactive(
        new ActionButtons(firstButton, ...restButtons),
        generateBody(bodyText),
        props.media ? new Header(props.media) : undefined,
        props.footer,
      ),
    ]
  }

  // `Interactive` throws when a list action carries a non-text header, so past
  // three replies the image is sent on its own and the replies are spread over
  // as many lists as they need instead of being cut off.
  return [
    ...leading,
    ...(props.media ? [props.media] : []),
    ...chunkList(replies, MAX_LIST_ROWS).map((chunk) => {
      const [firstRow, ...restRows] = chunk.map(({ id, label }) =>
        generateRow({ id, title: label }),
      )

      return new Interactive(
        new ActionList(
          DEFAULT_LIST_BUTTON_LABEL,
          new ListSection(undefined, firstRow, ...restRows),
        ),
        generateBody(bodyText),
        undefined,
        props.footer,
      )
    }),
  ]
}
