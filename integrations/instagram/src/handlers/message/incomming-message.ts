import { deriveAdSourcePlatform } from "@chatbotx.io/business/referral"
import {
  type Context,
  contentTypes,
  type IncomingAttachment,
  type IncomingContact,
  type IncomingMessage,
  type MessageReferral,
  messageTypes,
  type ReceivedMessageResult,
} from "@chatbotx.io/sdk"

import { getMessageAttachmentEntity } from "../../apis/page"
import { InstagramException } from "../../exception"
import { logger } from "../../lib/logger"
import {
  type InstagramAuthValue,
  type InstagramMessage,
  type InstagramMessagingEvent,
  instagramWebhookEventSchema,
  type InstagramReferral as RawInstagramReferral,
} from "../../schemas"

const getMessageAttachments = async (
  ctx: Context<InstagramAuthValue>,
  message: InstagramMessage,
): Promise<IncomingAttachment[]> => {
  if (!message.attachments) {
    return []
  }

  try {
    // Instagram/Messenger can send the same sticker/attachment twice in one
    // message's attachments array (same payload.url repeated) — dedupe
    // before downloading, otherwise it gets uploaded and stored twice.
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

const getMessageLocation = (message: InstagramMessage) => {
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

const normalizeReferral = (
  referral: RawInstagramReferral,
): MessageReferral => ({
  ref: referral.ref,
  source: referral.source,
  type: referral.type,
  adId: referral.ad_id ?? null,
  adTitle: referral.ads_context_data?.ad_title ?? null,
  sourceUrl: referral.source_url ?? null,
  sourcePlatform:
    referral.source_platform ?? deriveAdSourcePlatform(referral.source_url),
  postId: referral.ads_context_data?.post_id ?? null,
  photoUrl: referral.ads_context_data?.photo_url ?? null,
  videoUrl: referral.ads_context_data?.video_url ?? null,
  productId: referral.ads_context_data?.product_id ?? null,
  flowId: referral.ads_context_data?.flow_id ?? null,
  raw: referral,
})

export const receiveMessage = async ({
  ctx,
  data,
}: {
  ctx: Context<InstagramAuthValue>
  data: {
    integrationType: string
    integrationIdentifier: string
    payload: unknown
  }
}): Promise<ReceivedMessageResult> => {
  const validatedData = instagramWebhookEventSchema.parse(data.payload)

  const entry = validatedData.entry[0]

  if (!entry.messaging?.[0]) {
    throw new InstagramException("No messaging found")
  }

  const messaging = entry.messaging[0]
  if (!(messaging.message || messaging.postback || messaging.referral)) {
    throw new InstagramException("No message found")
  }

  return await getMessageEntity(ctx, messaging)
}

const getMessageEntity = async (
  ctx: Context<InstagramAuthValue>,
  messaging: InstagramMessagingEvent,
): Promise<ReceivedMessageResult> => {
  let message: IncomingMessage | null = null
  let postbackAction: string | null = null
  let quickReplyAction: string | null = null
  let ref: string | null = null
  let referralSource: string | null = null
  let referral: MessageReferral | null = null
  let buttonTitle: string | null = null

  const contactSourceId =
    messaging.sender.id === ctx.auth.metadata.igId
      ? messaging.recipient.id
      : messaging.sender.id
  const contact: IncomingContact = {
    sourceId: contactSourceId,
  }

  if (messaging.message) {
    const location = getMessageLocation(messaging.message)
    const storyReply = messaging.message.reply_to?.story
    message = {
      sourceId: messaging.message.mid,
      messageType:
        messaging.sender.id === ctx.auth.metadata.igId
          ? messageTypes.enum.outgoing
          : messageTypes.enum.incoming,
      text: messaging.message.text,
      contentType: location
        ? contentTypes.enum.location
        : contentTypes.enum.text,
      contentAttributes:
        location ??
        (storyReply ? { type: "story_reply", story: storyReply } : undefined),
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

  if (messaging.referral) {
    ref = messaging.referral.ref
    referralSource = messaging.referral.source
    referral = normalizeReferral(messaging.referral)
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
