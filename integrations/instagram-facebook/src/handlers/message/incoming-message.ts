import { normalizeMetaAdReferral } from "@chatbotx.io/business/referral"
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
} from "../../schemas"

const getMessageAttachments = async (
  ctx: Context<InstagramAuthValue>,
  message: InstagramMessage,
): Promise<IncomingAttachment[]> => {
  if (!message.attachments) {
    return []
  }

  try {
    const attachmentPromises = message.attachments
      .filter((attachment) => attachment.payload.url)
      .map((attachment) =>
        getMessageAttachmentEntity({ ctx, attachment }).catch((error) => {
          logger.error("Error processing attachment", error)
          return null
        }),
      )

    const attachmentResults = await Promise.allSettled(attachmentPromises)
    return attachmentResults
      .filter(
        (result): result is PromiseFulfilledResult<IncomingAttachment> =>
          result.status === "fulfilled" && result.value !== null,
      )
      .map((result) => result.value)
  } catch (error) {
    logger.error(error, "Error getting message attachments")
    return []
  }
}

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

  const contactSourceId =
    messaging.sender.id === ctx.auth.metadata.igId
      ? messaging.recipient.id
      : messaging.sender.id
  const contact: IncomingContact = {
    sourceId: contactSourceId,
  }

  if (messaging.message) {
    const storyReply = messaging.message.reply_to?.story
    message = {
      sourceId: messaging.message.mid,
      messageType:
        messaging.sender.id === ctx.auth.metadata.igId
          ? messageTypes.enum.outgoing
          : messageTypes.enum.incoming,
      text: messaging.message.text,
      contentType: contentTypes.enum.text,
      contentAttributes: storyReply
        ? { type: "story_reply", story: storyReply }
        : undefined,
      attachments: await getMessageAttachments(ctx, messaging.message),
    }
    quickReplyAction = messaging.message.quick_reply?.payload ?? null
  }

  if (messaging.postback) {
    message = {
      sourceId: messaging.postback.mid,
      messageType: messageTypes.enum.incoming,
      text: messaging.postback.title,
      contentType: contentTypes.enum.text,
    }
    postbackAction = messaging.postback.payload
  }

  // Meta delivers the SAME ad referral through three different slots depending
  // on the thread's state, and only ever one of them per event:
  //   - `messaging.referral`          -> `messaging_referral`, existing thread
  //   - `messaging.message.referral`  -> `messages`, NEW thread opened by a CTD
  //                                      ad where the user sends a message
  //                                      straight away (the common CTD case)
  //   - `messaging.postback.referral` -> NEW thread opened via an icebreaker
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
    contact,
  }
}
