import {
  appendCodeToMagicLink,
  type ButtonStepProps,
  encodeButtonPayload,
  extractMetadata,
  getButtonLinkUrl,
  type MetadataPayload,
} from "@chatbotx.io/flow-config"
import {
  getCanonicalReplyPayload,
  type MessageButtonTemplate,
} from "@chatbotx.io/sdk"
import {
  ActionButtons,
  ActionCTA,
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

type WhatsappLinkButton = {
  id: string
  label: string
  url: string
}

/**
 * Meta requires a body on every interactive message, including a `cta_url`
 * one, but a link button carries no body text of its own — mirrors the
 * carousel's `CAROUSEL_MAIN_BODY` convention for the same requirement.
 */
const EMPTY_BODY_PLACEHOLDER = "."

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

/**
 * `openWebsite` buttons are pulled out before `selectReplyButtons` ever sees
 * them: Meta renders a link as its own `cta_url` message, never as a reply, so
 * treating one as a reply candidate would keep silently dropping its URL.
 */
function selectLinkButtons(props: {
  flowId: string
  flowVersionId?: string
  buttons: ButtonStepProps[]
  metadata?: MetadataPayload
  contactInboxId?: string
}): WhatsappLinkButton[] {
  return props.buttons.flatMap((button) => {
    const url = getButtonLinkUrl(button)
    if (!url) {
      return []
    }

    const { id, label } = normalizeRawButton({
      flowId: props.flowId,
      flowVersionId: props.flowVersionId,
      button,
      metadata: props.metadata,
      contactInboxId: props.contactInboxId,
    })

    return [{ id, label, url }]
  })
}

function chunkList<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, index * size + size),
  )
}

/**
 * The reply-buttons/list half of the message sequence — unchanged behavior,
 * extracted so `buildWhatsappButtonMessages` can place it beside the `cta_url`
 * messages a link button now also produces.
 */
function buildReplyMessages(props: {
  replies: WhatsappReplyButton[]
  bodyText: string
  media?: Image
  footer?: Footer
}): ClientMessage[] {
  const { replies, bodyText, media, footer } = props

  // Reply buttons can carry the image inline, which reads best when it all fits.
  if (replies.length <= MAX_BUTTONS) {
    const [firstButton, ...restButtons] = replies.map(({ id, label }) =>
      generateButton({ id, title: label }),
    )

    return [
      new Interactive(
        new ActionButtons(firstButton, ...restButtons),
        generateBody(bodyText),
        media ? new Header(media) : undefined,
        footer,
      ),
    ]
  }

  // `Interactive` throws when a list action carries a non-text header, so past
  // three replies the image is sent on its own and the replies are spread over
  // as many lists as they need instead of being cut off.
  return [
    ...(media ? [media] : []),
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
        footer,
      )
    }),
  ]
}

/**
 * One `cta_url` message for a single link button. Meta allows exactly one url
 * button per message and forbids mixing it with reply buttons, so every link
 * button becomes its own bubble rather than being combined with another.
 *
 * No `media` parameter on purpose: `whatsapp-api-js`'s `Interactive`
 * constructor throws unless a `cta_url` action's header is text (same
 * restriction it applies to `ActionList`), so an image can never be this
 * message's header — see the standalone-`Image` handling in
 * `buildWhatsappButtonMessages` instead.
 *
 * The magic-link code is the button's own encoded id — the same one a reply
 * would have carried — so the redirect route can still resolve `steps` on
 * click; see `appendCodeToMagicLink` and `normalizeRawButton`.
 */
function buildCtaUrlMessage(props: {
  linkButton: WhatsappLinkButton
  bodyText: string
  footer?: Footer
}): Interactive {
  return new Interactive(
    new ActionCTA(
      clampText(props.linkButton.label, messageLimits.buttonTitle),
      appendCodeToMagicLink(props.linkButton.url, props.linkButton.id),
    ),
    generateBody(props.bodyText.trim() || EMPTY_BODY_PLACEHOLDER),
    undefined,
    props.footer,
  )
}

/**
 * Builds the message sequence that carries `bodyText`, an optional image and a
 * set of buttons — reply buttons/quick replies plus any `openWebsite` link
 * buttons.
 *
 * Nothing is discarded to fit a WhatsApp limit: overflowing text and overflowing
 * replies each become additional messages. Only values with nowhere to overflow
 * to — a button title, a footer — are clamped.
 *
 * Meta allows only one body per message and forbids mixing a `cta_url` action
 * with reply buttons, so only one message — the "primary" one — carries the
 * real body text; every other button becomes an additional bubble whose body
 * is just its own label. Reply buttons win the primary slot when present,
 * since they can hold more than one button and (up to three of them) can still
 * carry the image inline; otherwise the first link button takes the primary
 * slot and the image is sent as its own message ahead of it, the same way it
 * is ahead of a reply list past three buttons.
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
  /** Only a link button's magic-link code carries this — see `normalizeRawButton`. */
  contactInboxId?: string
}): ClientMessage[] {
  const linkButtons = selectLinkButtons({
    flowId: props.flowId,
    flowVersionId: props.flowVersionId,
    buttons: props.buttons,
    metadata: props.metadata,
    contactInboxId: props.contactInboxId,
  })

  const replies = selectReplyButtons({
    flowId: props.flowId,
    flowVersionId: props.flowVersionId,
    buttons: props.buttons.filter((button) => !getButtonLinkUrl(button)),
    quickReplies: props.quickReplies,
    metadata: props.metadata,
  })

  if (replies.length === 0 && linkButtons.length === 0) {
    return []
  }

  // Only the closing chunk becomes the interactive body; anything before it
  // leads as plain text so a long message keeps all of its content.
  const bodyChunks = splitText(props.bodyText, messageLimits.bodyText)
  const bodyText = bodyChunks.at(-1) ?? ""
  const leading: ClientMessage[] = bodyChunks
    .slice(0, -1)
    .map((chunk) => new Text(chunk))

  if (replies.length > 0) {
    return [
      ...leading,
      ...buildReplyMessages({
        replies,
        bodyText,
        media: props.media,
        footer: props.footer,
      }),
      ...linkButtons.map((linkButton) =>
        buildCtaUrlMessage({ linkButton, bodyText: linkButton.label }),
      ),
    ]
  }

  const [primaryLink, ...extraLinks] = linkButtons

  return [
    ...leading,
    ...(props.media ? [props.media] : []),
    buildCtaUrlMessage({
      linkButton: primaryLink,
      bodyText,
      footer: props.footer,
    }),
    ...extraLinks.map((linkButton) =>
      buildCtaUrlMessage({ linkButton, bodyText: linkButton.label }),
    ),
  ]
}
