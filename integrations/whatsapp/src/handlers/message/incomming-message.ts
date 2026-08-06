import { deriveAdSourcePlatform } from "@chatbotx.io/business/referral"
import {
  contentTypes,
  type IncomingContact,
  type IncomingMessage,
  type MessageHandlers,
  type MessageReferral,
  messageTypes,
} from "@chatbotx.io/sdk"
import type { ServerMessageTypes } from "whatsapp-api-js/types"
import { getWhatsappClient } from "../../client"
import { asString } from "../../lib/value"
import type { WhatsappAuthValue, WhatsappWebhookEvent } from "../../schema"
import {
  parseAudioMessage,
  parseDocumentMessage,
  parseImageMessage,
  parseStickerMessage,
  parseVideoMessage,
} from "./incoming-media"
import { readInteractiveReply, readTemplateButtonReply } from "./incoming-reply"
import type {
  IncomingMessageFragment,
  WhatsappMessageParser,
} from "./message-parser-types"

type WhatsappReferralPayload = Record<string, unknown> & {
  ctwa_clid?: string
  source_url?: string
  source_type?: string
  source_id?: string
  headline?: string
  body?: string
  media_type?: string
  image_url?: string
  video_url?: string
  thumbnail_url?: string
}

const getWhatsappReferral = (
  message: WhatsappWebhookEvent["message"],
): MessageReferral | null => {
  const referral = (message as { referral?: WhatsappReferralPayload }).referral
  if (!referral) {
    return null
  }

  return {
    ref: asString(referral.source_id),
    source: asString(referral.source_type),
    type: asString(referral.source_type),
    adId: asString(referral.source_id),
    adTitle: asString(referral.headline),
    sourceUrl: asString(referral.source_url),
    sourcePlatform: deriveAdSourcePlatform(asString(referral.source_url)),
    ctwaClid: asString(referral.ctwa_clid),
    photoUrl: asString(referral.image_url) ?? asString(referral.thumbnail_url),
    videoUrl: asString(referral.video_url),
    raw: referral,
  }
}

const REF_PREFIX = "/ref-"

const parseTextMessage: WhatsappMessageParser<"text"> = (message) => {
  const body = message.text.body
  return body.startsWith(REF_PREFIX)
    ? { ref: body.slice(REF_PREFIX.length) }
    : { text: body }
}

const parseLocationMessage: WhatsappMessageParser<"location"> = (message) => {
  const attached = message.location
  const label = [attached.name, attached.address].filter(Boolean).join(": ")

  return {
    contentType: contentTypes.enum.location,
    // `[...].join(": ") ?? "Received location"` never fell back — `join`
    // never returns null/undefined — so a location with neither field used to
    // silently produce `""`. Fixed here (owner decision, 2026-07-31).
    text: label || "Received location",
    contentAttributes: attached,
  }
}

const parseContactsMessage: WhatsappMessageParser<"contacts"> = (message) => ({
  text: "Received contacts",
  contentAttributes: { contacts: message.contacts },
})

const parseOrderMessage: WhatsappMessageParser<"order"> = (message) => ({
  contentAttributes: message.order,
})

const parseInteractiveMessage: WhatsappMessageParser<"interactive"> = (
  message,
) => {
  const reply = readInteractiveReply(message.interactive)
  return {
    text: reply.text,
    postbackAction: reply.postbackAction,
    templateFlowToken: reply.templateFlowToken,
    buttonTitle: reply.buttonTitle,
    contentAttributes: reply.contentAttributes,
  }
}

const parseButtonMessage: WhatsappMessageParser<"button"> = (message) => {
  const reply = readTemplateButtonReply(message.button)
  return {
    text: reply.text,
    postbackAction: reply.postbackAction,
    buttonTitle: reply.buttonTitle,
  }
}

/**
 * One parser per WhatsApp message type — a Strategy table replacing the old
 * nested `switch`, mirroring `routableHandleAccessors`
 * (`packages/flow-config/src/routable-handle.ts:296`), this repo's existing
 * pattern for "look up the handler for a discriminant".
 *
 * Unlisted types (`reaction`, `system`, `request_welcome`, and anything Meta
 * adds later) fall through to the generic label in `receiveMessage` below,
 * matching the old `default` branch exactly.
 */
const messageParsers: {
  readonly [Type in ServerMessageTypes["type"]]?: WhatsappMessageParser<Type>
} = {
  text: parseTextMessage,
  location: parseLocationMessage,
  contacts: parseContactsMessage,
  order: parseOrderMessage,
  interactive: parseInteractiveMessage,
  button: parseButtonMessage,
  audio: parseAudioMessage,
  document: parseDocumentMessage,
  image: parseImageMessage,
  sticker: parseStickerMessage,
  video: parseVideoMessage,
}

export const receiveMessage: MessageHandlers<WhatsappAuthValue>["receiveMessage"] =
  async (props) => {
    const {
      ctx,
      data: { payload },
    } = props

    const data = payload as WhatsappWebhookEvent
    const whatsappClient = getWhatsappClient(ctx.auth)
    const referral = getWhatsappReferral(data.message)

    const message: IncomingMessage = {
      sourceId: data.message.id,
      messageType: messageTypes.enum.incoming,
      contentType: contentTypes.enum.text,
    }
    const contact: IncomingContact = {
      sourceId: data.from,
      firstName: data.name,
    }

    const parse = messageParsers[data.message.type]
    // The registry key is the discriminant just read off `data.message`, so
    // the pairing is sound; TypeScript cannot prove it through the lookup —
    // same documented-assertion pattern as `readInteractiveReply`.
    const fragment: IncomingMessageFragment = parse
      ? await parse(data.message as never, { ctx, whatsappClient })
      : { text: `Received ${data.message.type}` }

    if (fragment.text !== undefined) {
      message.text = fragment.text
    }
    if (fragment.contentType) {
      message.contentType = fragment.contentType
    }
    if (fragment.attachments) {
      message.attachments = fragment.attachments
    }
    if (fragment.contentAttributes) {
      message.contentAttributes = fragment.contentAttributes
    }

    return {
      message,
      contact,
      postbackAction: fragment.postbackAction ?? null,
      templateFlowToken: fragment.templateFlowToken ?? null,
      quickReplyAction: null,
      ref: fragment.ref ?? referral?.ref ?? null,
      referralSource: referral?.source ?? null,
      referral,
      buttonTitle: fragment.buttonTitle ?? null,
    }
  }
