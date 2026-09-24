import { normalizeMetaAdReferral } from "@chatbotx.io/business/referral"
import {
  type Context,
  contentTypes,
  type EchoAttachmentDescriptor,
  type EchoParseResult,
  type IncomingAttachment,
  type IncomingContact,
  type IncomingMessage,
  type MessageHandlers,
  type MessageReferral,
  messageTypes,
  type ReceivedMessageResult,
  resolveChannelMessageCreatedAt,
} from "@chatbotx.io/sdk"
import {
  DEFAULT_MEDIA_DOWNLOAD_MAX_BYTES,
  DEFAULT_MEDIA_DOWNLOAD_TIMEOUT_MS,
} from "@chatbotx.io/utils/media-download"
import { getMessageAttachmentEntity } from "../../apis/attachment"
import { MessengerException } from "../../exception"
import { logger } from "../../lib/logger"
import {
  type MessengerAttachment,
  type MessengerAuthValue,
  type MessengerMessage,
  type MessengerMessagingEvent,
  messengerAttachmentSchema,
  messengerMessagingEventSchema,
  messengerWebhookEventSchema,
} from "../../schema"

type MessageCore = {
  sourceId: IncomingMessage["sourceId"]
  createdAt?: IncomingMessage["createdAt"]
  messageType: IncomingMessage["messageType"]
  text: IncomingMessage["text"]
  contentType: IncomingMessage["contentType"]
  contentAttributes?: Record<string, unknown>
}

type DownloadableMessengerAttachment = MessengerAttachment & {
  payload: MessengerAttachment["payload"] & { url: string }
}

/** Maximum unique attachments retained by the Messenger echo parser. */
export const MESSENGER_ECHO_MAX_ATTACHMENTS = 10

const dedupeAttachmentsByUrl = (
  message: MessengerMessage,
): DownloadableMessengerAttachment[] => {
  const seenUrls = new Set<string>()
  return (message.attachments ?? []).filter(
    (attachment): attachment is DownloadableMessengerAttachment => {
      const url = attachment.payload.url
      if (!url || seenUrls.has(url)) {
        return false
      }
      seenUrls.add(url)
      return true
    },
  )
}

const downloadMessageAttachments = async (
  ctx: Context<MessengerAuthValue>,
  attachments: Array<{
    attachment: MessengerAttachment
    sourceId?: string
  }>,
  download?: { timeoutMs: number; maxBytes: number },
): Promise<IncomingAttachment[]> => {
  const attachmentPromises = attachments.map(({ attachment, sourceId }) =>
    getMessageAttachmentEntity({ ctx, attachment, sourceId, download }).catch(
      (error) => {
        logger.error({ err: error }, "Error processing attachment")
        return null
      },
    ),
  )

  const attachmentResults = await Promise.allSettled(attachmentPromises)
  return attachmentResults
    .filter(
      (result): result is PromiseFulfilledResult<IncomingAttachment> =>
        result.status === "fulfilled" && result.value != null,
    )
    .map((result) => result.value)
}

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
    return await downloadMessageAttachments(
      ctx,
      dedupeAttachmentsByUrl(message).map((attachment) => ({ attachment })),
    )
  } catch (error) {
    logger.error({ err: error }, "Error getting message attachments")
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

const getMessageCore = (
  messaging: MessengerMessagingEvent,
  pageId: string,
): MessageCore | null => {
  if (!messaging.message) {
    return null
  }
  const location = getMessageLocation(messaging.message)
  const isOutgoing = messaging.sender.id === pageId
  const createdAt = isOutgoing
    ? resolveChannelMessageCreatedAt(messaging.timestamp)
    : null
  return {
    sourceId: messaging.message.mid,
    createdAt: createdAt ?? undefined,
    messageType: isOutgoing
      ? messageTypes.enum.outgoing
      : messageTypes.enum.incoming,
    text: messaging.message.text,
    contentType: location ? contentTypes.enum.location : contentTypes.enum.text,
    contentAttributes: location ?? undefined,
  }
}

const getEchoAttachmentDescriptors = (
  message: MessengerMessage,
): EchoAttachmentDescriptor[] =>
  dedupeAttachmentsByUrl(message)
    .filter((attachment) => attachment.type !== "template")
    .slice(0, MESSENGER_ECHO_MAX_ATTACHMENTS)
    .map((attachment, index) => ({
      sourceId: `${message.mid}:${index}`,
      type: attachment.type,
      url: attachment.payload.url,
    }))

export const parseEcho: NonNullable<
  MessageHandlers<MessengerAuthValue>["parseEcho"]
  // biome-ignore lint/suspicious/useAwait: the async handler contract turns validation throws into rejections
> = async ({ ctx, data }): Promise<EchoParseResult | null> => {
  const messaging = messengerMessagingEventSchema.parse(data.payload)
  const core = getMessageCore(messaging, ctx.auth.metadata.pageId)
  if (!(core?.createdAt && messaging.message)) {
    return null
  }
  return {
    sourceId: core.sourceId,
    contactSourceId: messaging.recipient.id,
    createdAt: core.createdAt,
    text: core.text,
    contentType: core.contentType,
    contentAttributes: core.contentAttributes,
    attachments: getEchoAttachmentDescriptors(messaging.message),
  }
}

export const downloadAttachments: NonNullable<
  MessageHandlers<MessengerAuthValue>["downloadAttachments"]
> = async ({ ctx, data }) => {
  const attachments = data.descriptors.map((descriptor) => {
    const attachment = messengerAttachmentSchema.parse({
      type: descriptor.type,
      payload: { url: descriptor.url },
    })
    return { attachment, sourceId: descriptor.sourceId }
  })
  return await downloadMessageAttachments(ctx, attachments, {
    timeoutMs: DEFAULT_MEDIA_DOWNLOAD_TIMEOUT_MS,
    maxBytes: DEFAULT_MEDIA_DOWNLOAD_MAX_BYTES,
  })
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

  const sourceId =
    messaging.sender.id === ctx.auth.metadata.pageId
      ? messaging.recipient.id
      : messaging.sender.id
  const contact: IncomingContact = {
    sourceId,
  }

  if (messaging.message) {
    const core = getMessageCore(messaging, ctx.auth.metadata.pageId)
    message = core
      ? {
          ...core,
          attachments: await getMessageAttachments(ctx, messaging.message),
        }
      : null
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
  }
}
