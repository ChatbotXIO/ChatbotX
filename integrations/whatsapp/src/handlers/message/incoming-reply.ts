import {
  decodeButtonPayload,
  isTemplateFlowToken,
} from "@chatbotx.io/flow-config"
import type {
  IncomingMessage,
  MessageWhatsappCallPermissionReplyEntity,
  MessageWhatsappFlowResponseEntity,
  MessageWhatsappPaymentMethodEntity,
} from "@chatbotx.io/sdk"
import type {
  ServerButtonMessage,
  ServerInteractiveMessage,
} from "whatsapp-api-js/types"
import { logger } from "../../lib/logger"
import { asString, isRecord } from "../../lib/value"

type WhatsappNfmFlowResponse = Record<string, unknown> & {
  flow_token?: string
}

type WhatsappInteractiveReply = ServerInteractiveMessage["interactive"]
type WhatsappInteractiveReplyType = WhatsappInteractiveReply["type"]

/**
 * What a tapped reply contributes to the parsed message.
 *
 * `postbackAction` is passed through unvalidated on purpose: the worker's
 * `sanitizeFlowAction` is the single authority on whether a payload belongs to
 * this flow engine. Re-checking it here would duplicate that rule and let the
 * two drift.
 */
export type WhatsappReply = {
  postbackAction: string | null
  templateFlowToken?: string | null
  text: string
  buttonTitle: string | null
  contentAttributes?: IncomingMessage["contentAttributes"]
}

const UNHANDLED_INTERACTIVE_TEXT = "Received interactive (coming soon)"

const parseNfmReplyResponse = (
  responseJson: string,
): WhatsappNfmFlowResponse => {
  try {
    return JSON.parse(responseJson) as WhatsappNfmFlowResponse
  } catch (error) {
    logger.warn(
      { error, responseJson },
      "Failed to parse nfm_reply.response_json",
    )
    return {}
  }
}

const getNfmFlowToken = (flowResponse: WhatsappNfmFlowResponse) =>
  typeof flowResponse.flow_token === "string" ? flowResponse.flow_token : null

/** Partial on purpose: an unlisted type falls through to the logged fallback. */
type InteractiveReplyReaders = {
  readonly [Type in WhatsappInteractiveReplyType]?: (
    reply: Extract<WhatsappInteractiveReply, { type: Type }>,
    /** The `context.id` of the reply: the message it answers. */
    contextMessageId: string | null,
  ) => WhatsappReply
}

const interactiveReplyReaders: InteractiveReplyReaders = {
  button_reply: (interactive) => ({
    postbackAction: interactive.button_reply.id,
    text: interactive.button_reply.title,
    buttonTitle: interactive.button_reply.title,
  }),
  list_reply: (interactive) => ({
    postbackAction: interactive.list_reply.id,
    text: interactive.list_reply.title,
    buttonTitle: interactive.list_reply.title,
    contentAttributes: interactive.list_reply,
  }),
  nfm_reply: (interactive, contextMessageId) => {
    const reply = interactive.nfm_reply
    const flowResponse = parseNfmReplyResponse(reply.response_json)
    const flowToken = getNfmFlowToken(flowResponse)
    const decodedPayload = flowToken ? decodeButtonPayload(flowToken) : null

    const flowResponseEntity: MessageWhatsappFlowResponseEntity = {
      type: "whatsapp_flow_response",
      name: reply.name,
      flowResponse,
      flowToken,
      decoded: decodedPayload,
      ...(contextMessageId ? { contextMessageId } : {}),
    }

    return {
      postbackAction: flowToken && decodedPayload?.buttonId ? flowToken : null,
      templateFlowToken:
        flowToken && !decodedPayload && isTemplateFlowToken(flowToken)
          ? flowToken
          : null,
      text: reply.body ?? "",
      buttonTitle: reply.body ?? null,
      contentAttributes: flowResponseEntity,
    }
  },
}

/**
 * WhatsApp Business Calling permission answers
 * (`interactive.type: "call_permission_reply"`). Not modeled by
 * whatsapp-api-js yet, so the shape is read off the raw payload here.
 */
type WhatsappCallPermissionReplyPayload = {
  type: "call_permission_reply"
  call_permission_reply: {
    response: "accept" | "reject"
    is_permanent?: boolean
    expiration_timestamp?: number | string
    response_source?: string
  }
}

const asCallPermissionReply = (
  reply: WhatsappInteractiveReply,
): WhatsappCallPermissionReplyPayload["call_permission_reply"] | undefined => {
  const raw = reply as unknown as Partial<WhatsappCallPermissionReplyPayload>
  if (raw.type !== "call_permission_reply") {
    return
  }
  const payload = raw.call_permission_reply
  if (
    payload &&
    (payload.response === "accept" || payload.response === "reject")
  ) {
    return payload
  }
  return
}

const readCallPermissionReply = (
  payload: WhatsappCallPermissionReplyPayload["call_permission_reply"],
): WhatsappReply => {
  const expiration = Number(payload.expiration_timestamp)
  const entity: MessageWhatsappCallPermissionReplyEntity = {
    type: "whatsapp_call_permission_reply",
    response: payload.response,
    isPermanent: payload.is_permanent === true,
    expirationTimestamp: Number.isFinite(expiration) ? expiration : undefined,
    responseSource: payload.response_source,
  }

  return {
    postbackAction: null,
    // English fallback for previews; the inbox renders a localized label
    // from `contentAttributes` instead.
    text:
      payload.response === "accept"
        ? "Accepted call permission request"
        : "Declined call permission request",
    buttonTitle: null,
    contentAttributes: entity,
  }
}

const asFiniteNumber = (value: unknown): number | undefined => {
  const parsed = Number(value)
  return value !== null && value !== "" && Number.isFinite(parsed)
    ? parsed
    : undefined
}

/**
 * A `payment_method` reply whose payload is not an object: shown like any
 * unhandled interactive, with the raw value kept in the message and nothing
 * logged (it can hold a credential).
 */
const unreadablePaymentMethodReply = (rawValue: unknown): WhatsappReply => ({
  postbackAction: null,
  text: UNHANDLED_INTERACTIVE_TEXT,
  buttonTitle: null,
  contentAttributes: {
    unhandledInteractive: {
      type: "payment_method",
      payment_method: rawValue ?? null,
    },
  },
})

/**
 * One-click payment confirmations (`interactive.type: "payment_method"`). Not
 * modeled by whatsapp-api-js, and the Cloud API docs only show the Orders
 * flavor of the payload, so every field but the discriminant is optional and
 * the raw object is always kept.
 */
const readPaymentMethodReply = (
  reply: WhatsappInteractiveReply,
): WhatsappReply | undefined => {
  const raw = reply as unknown as { type?: string; payment_method?: unknown }
  if (raw.type !== "payment_method") {
    return
  }
  const payload = raw.payment_method
  if (!isRecord(payload)) {
    return unreadablePaymentMethodReply(payload)
  }
  const lastFourDigits = asString(payload.last_four_digits) ?? undefined
  const entity: MessageWhatsappPaymentMethodEntity = {
    type: "whatsapp_payment_method",
    paymentMethod: asString(payload.payment_method) ?? "unknown",
    lastFourDigits,
    credentialId: asString(payload.credential_id) ?? undefined,
    referenceId: asString(payload.reference_id) ?? undefined,
    paymentTimestamp: asFiniteNumber(payload.payment_timestamp),
    raw: payload,
  }

  return {
    postbackAction: null,
    // English fallback for previews; the inbox renders a localized label
    // from `contentAttributes` instead.
    text: lastFourDigits
      ? `Customer confirmed card payment ending ${lastFourDigits} (not charged yet)`
      : "Customer confirmed payment (not charged yet)",
    buttonTitle: null,
    contentAttributes: entity,
  }
}

/**
 * Dispatch, keyed by `interactive.type`. The table's key *is* the discriminant
 * just read off `reply`, so the pairing is sound even though TypeScript can't
 * prove it through the lookup — one documented assertion, mirroring the
 * precedent at `packages/flow-config/src/routable-handle.ts:296`.
 */
export const readInteractiveReply = (
  reply: WhatsappInteractiveReply,
  contextMessageId: string | null = null,
): WhatsappReply => {
  const callPermissionReply = asCallPermissionReply(reply)
  if (callPermissionReply) {
    return readCallPermissionReply(callPermissionReply)
  }

  const paymentMethodReply = readPaymentMethodReply(reply)
  if (paymentMethodReply) {
    return paymentMethodReply
  }

  const read = interactiveReplyReaders[reply.type]
  if (!read) {
    logger.warn({ interactive: reply }, "Unhandled WhatsApp interactive reply")
    return {
      postbackAction: null,
      text: UNHANDLED_INTERACTIVE_TEXT,
      buttonTitle: null,
    }
  }
  return (
    read as (
      value: WhatsappInteractiveReply,
      contextMessageId: string | null,
    ) => WhatsappReply
  )(reply, contextMessageId)
}

/**
 * Carousel card quick-reply buttons and message-template quick-reply buttons
 * both arrive here.
 *
 * Unlike a reply button, which carries its flow action in `id`, these carry it
 * in `payload` — the field this path used to drop, leaving every tap unrouted.
 * Confirmed against a live webhook capture (2026-07-30).
 */
export const readTemplateButtonReply = (
  button: ServerButtonMessage["button"],
): WhatsappReply => ({
  postbackAction: asString(button.payload),
  text: button.text,
  buttonTitle: button.text,
})
