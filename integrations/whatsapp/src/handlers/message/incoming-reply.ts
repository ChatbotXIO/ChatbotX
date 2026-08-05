import {
  decodeButtonPayload,
  isTemplateFlowToken,
} from "@chatbotx.io/flow-config"
import type {
  IncomingMessage,
  MessageWhatsappFlowResponseEntity,
} from "@chatbotx.io/sdk"
import type {
  ServerButtonMessage,
  ServerInteractiveMessage,
} from "whatsapp-api-js/types"
import { logger } from "../../lib/logger"
import { asString } from "../../lib/value"

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
  nfm_reply: (interactive) => {
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
 * Dispatch, keyed by `interactive.type`. The table's key *is* the discriminant
 * just read off `reply`, so the pairing is sound even though TypeScript can't
 * prove it through the lookup — one documented assertion, mirroring the
 * precedent at `packages/flow-config/src/routable-handle.ts:296`.
 */
export const readInteractiveReply = (
  reply: WhatsappInteractiveReply,
): WhatsappReply => {
  const read = interactiveReplyReaders[reply.type]
  if (!read) {
    logger.warn({ interactive: reply }, "Unhandled WhatsApp interactive reply")
    return {
      postbackAction: null,
      text: UNHANDLED_INTERACTIVE_TEXT,
      buttonTitle: null,
    }
  }
  return (read as (value: WhatsappInteractiveReply) => WhatsappReply)(reply)
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
