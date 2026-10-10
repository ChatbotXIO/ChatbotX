import type {
  ContentType,
  Context,
  IncomingAttachment,
  IncomingMessage,
} from "@chatbotx.io/sdk"
import type { GoogleClickReferral } from "@chatbotx.io/utils/google-click"
import type { WhatsAppAPI } from "whatsapp-api-js"
import type { ServerMessageTypes } from "whatsapp-api-js/types"
import type { WhatsappAuthValue } from "../../schema"

/** What one message-type parser contributes to the incoming message. */
export type IncomingMessageFragment = {
  text?: string
  contentType?: ContentType
  attachments?: IncomingAttachment[]
  contentAttributes?: IncomingMessage["contentAttributes"]
  postbackAction?: string | null
  templateFlowToken?: string | null
  buttonTitle?: string | null
  ref?: string | null
  /** Google Ads click referral decoded from the invisible payload in the message text. */
  googleClick?: GoogleClickReferral
}

export type MessageParserDeps = {
  ctx: Context<WhatsappAuthValue>
  whatsappClient: WhatsAppAPI
  /** Provider message time (clock fallback); stamps the Google click capture. */
  receivedAt: Date
}

export type WhatsappMessageParser<Type extends ServerMessageTypes["type"]> = (
  message: Extract<ServerMessageTypes, { type: Type }>,
  deps: MessageParserDeps,
) => IncomingMessageFragment | Promise<IncomingMessageFragment>
