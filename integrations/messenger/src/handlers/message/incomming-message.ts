import { normalizeMetaAdReferral } from "@chatbotx.io/business/referral"
import {
  type Context,
  contentTypes,
  type EchoOrigin,
  echoOrigins,
  type IncomingAttachment,
  type IncomingContact,
  type IncomingMessage,
  type MessageHandlers,
  type MessageReferral,
  messageTypes,
  type ReceivedMessageResult,
} from "@chatbotx.io/sdk"
import { getMessageAttachmentEntity } from "../../apis/attachment"
import { MessengerException } from "../../exception"
import { logger } from "../../lib/logger"
import {
  META_FIRST_PARTY_ECHO_APP_IDS,
  type MessengerAuthValue,
  type MessengerMessage,
  type MessengerMessagingEvent,
  messengerWebhookEventSchema,
} from "../../schema"

const getMessageAttachments = async (
  ctx: Context<MessengerAuthValue>,
  message: MessengerMessage,
): Promise<IncomingAttachment[]> => {
  if (!message.attachments) {
    return []
  }

  try {
    // Facebook can send the same sticker/attachment twice in one message's
    // attachments array (same payload.url repeated) — dedupe before
    // downloading, otherwise it gets uploaded and stored as two attachments.
    const seenUrls = new Set<string>()
    const uniqueAttachments = message.attachments.filter((attachment) => {
      const url = attachment.payload.url
      if (!url || seenUrls.has(url)) {
        return false
      }
      seenUrls.add(url)
      return true
    })

    const attachmentPromises = uniqueAttachments.map((attachment) =>
      getMessageAttachmentEntity({ ctx, attachment }).catch((error) => {
        logger.error("Error processing attachment", error)
        return null
      }),
    )

    const attachmentResults = await Promise.allSettled(attachmentPromises)
    return attachmentResults
      .filter(
        (result): result is PromiseFulfilledResult<IncomingAttachment> =>
          result.status === "fulfilled" && result.value != null,
      )
      .map((result) => result.value)
  } catch (error) {
    logger.error(error, "Error getting message attachments")
    return []
  }
}

const getMessageLocation = (message: MessengerMessage) => {
  const location = message.attachments?.find(
    (attachment) => attachment.type === "location",
  )
  const coordinates = location?.payload.coordinates
  const latitude = coordinates?.latitude ?? coordinates?.lat
  const longitude = coordinates?.longitude ?? coordinates?.long
  if (latitude == null || longitude == null) {
    return null
  }
  return {
    latitude: String(latitude),
    longitude: String(longitude),
  }
}

const collectTitles = (elements: { title?: string }[] | undefined): string[] =>
  (elements ?? [])
    .map((element) => element.title?.trim() ?? "")
    .filter((title) => title.length > 0)

type TemplateAttachment = NonNullable<MessengerMessage["attachments"]>[number]

/**
 * Where a `template` echo's display text can come from, in priority order
 * (message_echoes reference: button / generic / media / product templates).
 * Media templates carry no title and resolve to nothing.
 */
const templateTitleResolvers: ((
  attachment: TemplateAttachment,
) => string | undefined)[] = [
  (attachment) => attachment.title?.trim() || undefined,
  (attachment) => attachment.payload.text?.trim() || undefined,
  (attachment) => {
    const titles = [
      ...collectTitles(attachment.payload.elements),
      ...collectTitles(attachment.payload.product?.elements),
    ]
    return titles.length > 0 ? titles.join("\n") : undefined
  },
]

/**
 * Text-only summary of a `template` attachment on an echo. The template body
 * is never stored as an attachment — it is display-only chrome that would
 * cost storage on every echo — so its title stands in as the message text.
 * Inbound messages are left untouched so a customer's product share never
 * gains text that could match keyword automation.
 */
const getTemplateTitle = (message: MessengerMessage): string | undefined => {
  if (message.is_echo !== true) {
    return
  }
  for (const attachment of message.attachments ?? []) {
    if (attachment.type !== "template") {
      continue
    }
    for (const resolve of templateTitleResolvers) {
      const title = resolve(attachment)
      if (title) {
        return title
      }
    }
  }
  return
}

/**
 * Meta documents `app_id` as a string but ships a JSON number. A number past
 * `Number.MAX_SAFE_INTEGER` has already lost digits in `JSON.parse`, so it is
 * reported as unknown rather than compared against the first-party set.
 */
const getEchoAppId = (message: MessengerMessage | undefined): string | null => {
  if (message?.is_echo !== true || message.app_id === undefined) {
    return null
  }
  if (typeof message.app_id === "number") {
    return Number.isSafeInteger(message.app_id) ? String(message.app_id) : null
  }
  return message.app_id
}

/** Classifies an echo by its sending app; null when not an echo or unknown. */
const getEchoOrigin = (echoAppId: string | null): EchoOrigin | null => {
  if (echoAppId === null) {
    return null
  }
  return META_FIRST_PARTY_ECHO_APP_IDS.has(echoAppId)
    ? echoOrigins.enum.firstParty
    : echoOrigins.enum.thirdParty
}

export const receiveMessage: MessageHandlers<MessengerAuthValue>["receiveMessage"] =
  async (props) => {
    const { ctx, data } = props
    const validatedData = messengerWebhookEventSchema.parse(data.payload)

    const entry = validatedData.entry[0]

    if (!entry.messaging?.[0]) {
      throw new MessengerException("No messaging found")
    }

    const messaging = entry.messaging[0]
    if (!(messaging.message || messaging.postback || messaging.referral)) {
      throw new MessengerException("No message found")
    }

    return await getMessageEntity(ctx, messaging)
  }

const getMessageEntity = async (
  ctx: Context<MessengerAuthValue>,
  messaging: MessengerMessagingEvent,
): Promise<ReceivedMessageResult> => {
  let message: IncomingMessage | null = null
  let postbackAction: string | null = null
  let quickReplyAction: string | null = null
  let ref: string | null = null
  let referralSource: string | null = null
  let referral: MessageReferral | null = null
  let buttonTitle: string | null = null

  const echoAppId = getEchoAppId(messaging.message)
  const sourceId =
    messaging.sender.id === ctx.auth.metadata.pageId
      ? messaging.recipient.id
      : messaging.sender.id
  const contact: IncomingContact = {
    sourceId,
  }

  if (messaging.message) {
    const location = getMessageLocation(messaging.message)
    message = {
      sourceId: messaging.message.mid,
      messageType:
        messaging.sender.id === ctx.auth.metadata.pageId
          ? messageTypes.enum.outgoing
          : messageTypes.enum.incoming,
      text: messaging.message.text ?? getTemplateTitle(messaging.message),
      contentType: location
        ? contentTypes.enum.location
        : contentTypes.enum.text,
      contentAttributes: location ?? undefined,
      attachments: await getMessageAttachments(ctx, messaging.message),
    }
    quickReplyAction = messaging.message.quick_reply?.payload ?? null
    buttonTitle = messaging.message.quick_reply?.title ?? null
  }

  if (messaging.postback) {
    message = {
      sourceId: messaging.postback.mid,
      messageType: messageTypes.enum.incoming,
      text: messaging.postback.title,
      contentType: contentTypes.enum.text,
    }
    postbackAction = messaging.postback.payload
    buttonTitle = messaging.postback.title
  }

  // Meta delivers the SAME ad referral through three different slots depending
  // on the thread's state, and only ever one of them per event:
  //   - `messaging.referral`          -> `messaging_referrals`, existing thread
  //   - `messaging.message.referral`  -> `messages`, NEW thread opened by the
  //                                      ad where the user sends a message
  //                                      straight away (the common CTM/CTD case)
  //   - `messaging.postback.referral` -> NEW thread opened via Get Started
  // Resolving all three in one place (rather than assigning at each parse site)
  // keeps the precedence explicit: an explicit referral event outranks one that
  // merely rode along with a message or a postback.
  // Order matters only for a payload carrying more than one of them, which
  // Meta does not send — but it is pinned deliberately rather than left to
  // chance: `postback.referral` stays ahead of `message.referral` so this
  // change adds the missing slot WITHOUT altering what an existing
  // postback-carrying payload resolves to.
  const rawReferral =
    messaging.referral ??
    messaging.postback?.referral ??
    messaging.message?.referral

  if (rawReferral) {
    ref = rawReferral.ref ?? null
    referralSource = rawReferral.source
    referral = normalizeMetaAdReferral(rawReferral)
  }

  return {
    message,
    postbackAction,
    quickReplyAction,
    ref,
    referralSource,
    referral,
    buttonTitle,
    contact,
    echoOrigin: getEchoOrigin(echoAppId),
    echoAppId,
  }
}
