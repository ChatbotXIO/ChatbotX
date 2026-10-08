import { normalizeMetaAdReferral } from "@chatbotx.io/business/referral"
import {
  type Context,
  contentTypes,
  echoOrigins,
  type IncomingAttachment,
  type IncomingContact,
  type IncomingMessage,
  type MessageHandlers,
  type MessageReferral,
  messageTypes,
  type ReceivedMessageResult,
  type ThreadControlReceiveInfo,
  threadControlRoles,
} from "@chatbotx.io/sdk"
import { consumeGoogleClickRef } from "@chatbotx.io/utils/google-click"
import {
  metaReferralTypes,
  PAID_AD_REFERRAL_SOURCE,
} from "@chatbotx.io/utils/referral"
import { z } from "zod"
import { getMessageAttachmentEntity } from "../../apis/attachment"
import { MessengerException } from "../../exception"
import { messengerTimestampToOccurredAt } from "../../lib/conversation-routing"
import { type MessengerEcho, parseEcho } from "../../lib/echo"
import { logger } from "../../lib/logger"
import { readBusinessAiAppId } from "../../lib/thread-control-config"
import {
  type MessengerAuthValue,
  type MessengerMessage,
  type MessengerMessagingEvent,
  type MessengerReferral,
  messengerStandbyEventSchema,
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

type MessageTextResolver = (
  message: MessengerMessage,
  echo: MessengerEcho,
) => string | undefined

/**
 * Where a stored message's text comes from, in priority order. Add a resolver
 * here to derive text from another payload shape.
 */
const isAdOpenThreadReferral = (referral?: MessengerReferral) =>
  referral?.source === PAID_AD_REFERRAL_SOURCE.meta &&
  referral.type === metaReferralTypes.enum.OPEN_THREAD

/**
 * Messages whose ad `referral.text` must NOT become the message text.
 * Add a rule here to exclude another message shape.
 */
const adReferralTextExclusions: ((message: MessengerMessage) => boolean)[] = [
  // Page-sent echo, never the user's tap.
  (message) => Boolean(message.is_echo),
  // An image/sticker keeps its own content instead of being rewritten as text.
  (message) => Boolean(message.attachments?.length),
  // Ads with a `ref` start their ref flow (`runRef`); the tapped question must
  // not also trigger keyword automation for them.
  (message) => Boolean(message.referral?.ref),
]

/**
 * Click-to-Messenger ads may carry the user's tapped question only in
 * `referral.text` (not documented by Meta, observed on real ad payloads).
 */
const resolveAdReferralText: MessageTextResolver = (message) => {
  const isExcluded = adReferralTextExclusions.some((exclude) =>
    exclude(message),
  )
  if (isExcluded || !isAdOpenThreadReferral(message.referral)) {
    return
  }
  return message.referral?.text
}

const messageTextResolvers: MessageTextResolver[] = [
  (message) => message.text,
  resolveAdReferralText,
  (_message, echo) => echo.templateTitle,
]

const resolveMessageText = (
  message: MessengerMessage,
  echo: MessengerEcho,
): string | undefined => {
  for (const resolve of messageTextResolvers) {
    const text = resolve(message, echo)
    if (text !== undefined) {
      return text
    }
  }
  return
}

const standbyEntrySchema = z.object({
  standby: z.array(z.unknown()).optional(),
})

/**
 * The `standby[0]` item of a standby delivery (the Conversation Routing
 * rewrap `{object, entry:[{id, time, standby:[item]}]}`), as a messaging event.
 * Meta strips a standby postback's `payload`/`title`; they default to empty
 * here and the postback is dropped when it has no `mid` to key a message on.
 * `null` when the payload is not a standby delivery.
 */
const readStandbyEvent = (
  entry: unknown,
): { event: MessengerMessagingEvent; occurredAt: Date } | null => {
  const item = standbyEntrySchema.safeParse(entry)
  const first = item.success ? item.data.standby?.[0] : undefined
  if (first === undefined) {
    return null
  }
  const parsed = messengerStandbyEventSchema.parse(first)
  const { postback, ...rest } = parsed
  const postbackWithMid = postback?.mid
    ? {
        postback: {
          mid: postback.mid,
          title: postback.title ?? "",
          payload: postback.payload ?? "",
        },
      }
    : {}
  return {
    event: { ...rest, ...postbackWithMid },
    occurredAt: messengerTimestampToOccurredAt(parsed.timestamp),
  }
}

const hopContextSchema = z.object({
  hop_context: z.object({ is_ai_thread_owner: z.unknown() }).optional(),
})

/**
 * Whether a standby delivery shows the Business-AI app owns the thread, from
 * any of the signals Meta sends:
 * - `entry[0].hop_context.is_ai_thread_owner` (v1-observed), or
 * - the `message_echoes` item's `ai_generated: true` flag (documented), or
 * - that item's `app_id` matching the Business-AI app id (documented).
 * Returns the Business-AI app id when owned by it, else `null` (never guessed).
 */
const readStandbyOwnerAppId = (
  entry: unknown,
  message: MessengerMessage | undefined,
): string | null => {
  const businessAiAppId = readBusinessAiAppId()
  const parsed = hopContextSchema.safeParse(entry)
  const isHopAiOwner =
    parsed.success && parsed.data.hop_context?.is_ai_thread_owner === true
  const isAiGenerated = message?.ai_generated === true
  const isBusinessAiEcho =
    message?.app_id != null && String(message.app_id) === businessAiAppId
  return isHopAiOwner || isAiGenerated || isBusinessAiEcho
    ? businessAiAppId
    : null
}

export const receiveMessage: MessageHandlers<MessengerAuthValue>["receiveMessage"] =
  async (props) => {
    const { ctx, data } = props
    const validatedData = messengerWebhookEventSchema.parse(data.payload)

    const entry = validatedData.entry[0]

    if (!entry.messaging?.[0]) {
      const rawEntry = (data.payload as { entry?: unknown[] } | null)
        ?.entry?.[0]
      const standby = readStandbyEvent(rawEntry)
      if (!standby) {
        throw new MessengerException("No messaging found")
      }
      const ownerAppId = readStandbyOwnerAppId(rawEntry, standby.event.message)
      return await getMessageEntity(ctx, standby.event, {
        delivery: "standby",
        occurredAt: standby.occurredAt,
        ...(ownerAppId
          ? { ownerAppId, ownerRole: threadControlRoles.enum.ai_agent }
          : {}),
      })
    }

    const messaging = entry.messaging[0]
    if (!(messaging.message || messaging.postback || messaging.referral)) {
      throw new MessengerException("No message found")
    }

    // Only a customer's message is an owner delivery: our own echo is an
    // outgoing message, not proof that we hold the thread.
    const isCustomerItem =
      messaging.message?.is_echo !== true &&
      messaging.sender.id !== ctx.auth.metadata.pageId
    return await getMessageEntity(
      ctx,
      messaging,
      isCustomerItem
        ? {
            delivery: "owner",
            occurredAt: messengerTimestampToOccurredAt(messaging.timestamp),
          }
        : undefined,
    )
  }

const getMessageEntity = async (
  ctx: Context<MessengerAuthValue>,
  messaging: MessengerMessagingEvent,
  threadControl?: ThreadControlReceiveInfo,
): Promise<ReceivedMessageResult> => {
  const isStandby = threadControl?.delivery === "standby"
  let message: IncomingMessage | null = null
  let postbackAction: string | null = null
  let quickReplyAction: string | null = null
  let ref: string | null = null
  let referralSource: string | null = null
  let referral: MessageReferral | null = null
  let buttonTitle: string | null = null

  const echo = parseEcho(messaging.message)
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
      text: resolveMessageText(messaging.message, echo),
      contentType: location
        ? contentTypes.enum.location
        : contentTypes.enum.text,
      contentAttributes: location ?? undefined,
      attachments: await getMessageAttachments(ctx, messaging.message),
    }
    quickReplyAction = messaging.message.quick_reply?.payload ?? null
    buttonTitle = messaging.message.quick_reply?.title ?? null
    // A standby echo is the partner's own outgoing message: kept as a
    // third-party echo (like the other channels), never as a customer message.
    if (isStandby && messaging.message.is_echo) {
      message.contentAttributes = {
        ...message.contentAttributes,
        threadControlEcho: true,
        // Persist Meta's AI-generation flag so the inbox can tell a Business-AI
        // reply apart from another partner's (Business AI Integration Guide §5.3).
        ...(messaging.message.ai_generated === true
          ? { aiGenerated: true }
          : {}),
      }
    }
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
    // `text` only feeds the inbound message text (see resolveAdReferralText);
    // keep it out of the stored referral so persisted tracking is unchanged.
    const { text: _referralText, ...storedReferral } = rawReferral
    referral = normalizeMetaAdReferral(storedReferral)

    // A Google Click-to-Message ref (`gclid:<id>,...`) is attribution, not a
    // ChatbotX reflink: consume it so the ref router never looks it up.
    const captured = consumeGoogleClickRef(
      rawReferral.ref,
      messengerTimestampToOccurredAt(messaging.timestamp),
    )
    if (captured.googleReferral) {
      ref = captured.ref
      // `raw` would keep the click id verbatim in `ref`; drop it.
      const { ref: _googleRef, ...rawWithoutRef } = storedReferral
      referral = {
        ...referral,
        ref: null,
        raw: rawWithoutRef,
        ...captured.googleReferral,
      }
    }
  }

  return {
    message,
    // A standby delivery is listen-only: it never routes a flow action.
    postbackAction: isStandby ? null : postbackAction,
    quickReplyAction: isStandby ? null : quickReplyAction,
    ref,
    referralSource,
    referral,
    buttonTitle,
    contact,
    echoOrigin:
      isStandby && messaging.message?.is_echo
        ? echoOrigins.enum.thirdParty
        : echo.origin,
    echoAppId: echo.appId,
    ...(threadControl ? { threadControl } : {}),
  }
}
