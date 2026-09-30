import type { ThreadControlAction, ThreadControlRole } from "@chatbotx.io/sdk"
import ky from "ky"
import { API_URL, DEFAULT_API_VERSION } from "../constants"
import { rescue } from "../exception"
import {
  isBsuidRecipient,
  type WhatsappRecipientParams,
} from "../lib/recipient"
import type { WhatsappAuthValue } from "../schema"

/** Meta caps the free-form handover `metadata` at 2000 characters. */
export const THREAD_CONTROL_METADATA_MAX_LENGTH = 2000

export type WhatsappThreadControlBody = WhatsappRecipientParams & {
  messaging_product: "whatsapp"
  action: ThreadControlAction
  metadata?: string
  control_pass?: { target_role: ThreadControlRole }
}

export const buildThreadControlBody = (input: {
  recipient: WhatsappRecipientParams
  action: ThreadControlAction
  targetRole?: ThreadControlRole
  metadata?: string
}): WhatsappThreadControlBody => ({
  messaging_product: "whatsapp",
  // Exactly one of `to` / `recipient` (BSUID preferred), never both.
  ...(isBsuidRecipient(input.recipient)
    ? { recipient: input.recipient.recipient }
    : { to: input.recipient.to }),
  action: input.action,
  ...(input.metadata
    ? { metadata: input.metadata.slice(0, THREAD_CONTROL_METADATA_MAX_LENGTH) }
    : {}),
  // `control_pass` is only valid with `pass`; without a role Meta routes to the
  // escalation partner.
  ...(input.action === "pass" && input.targetRole
    ? { control_pass: { target_role: input.targetRole } }
    : {}),
})

/**
 * `POST /{phone_number_id}/thread_control` — take, release or pass the thread.
 * The caller must own the thread (`take`: escalation partner only, else Meta
 * answers error 2494191).
 *
 * Reference: https://developers.facebook.com/documentation/business-messaging/whatsapp/conversation-routing/thread-control
 */
export const postThreadControl = (
  auth: WhatsappAuthValue,
  body: WhatsappThreadControlBody,
): Promise<void> => {
  const { version = DEFAULT_API_VERSION } = auth

  return rescue(async () => {
    await ky
      .post(
        `${API_URL}/${version}/${auth.metadata.phoneNumber.id}/thread_control`,
        {
          headers: { Authorization: `Bearer ${auth.tokens.accessToken}` },
          json: body,
        },
      )
      .json()
  })
}
