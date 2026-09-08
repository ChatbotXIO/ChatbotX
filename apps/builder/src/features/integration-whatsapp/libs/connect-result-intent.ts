import type { ConnectSessionErrorCode } from "@chatbotx.io/business/inbox/connect-outcome-types"
import type { MessageKey } from "@/features/channel-connect/lib/message-key"
import {
  CONNECT_WHATSAPP_RESULT_TYPES,
  type ConnectWhatsappResult,
  type WhatsappConnectOutcome,
  type WhatsappPhoneNumberOption,
} from "../schema"

/**
 * What `connectWhatsappAction`'s result means for the form, independent of
 * how it gets rendered — a pure classification of `ConnectWhatsappResult`
 * (`toConnectResultIntent`) so the branch table is unit-testable without
 * mounting `WhatsappCreate`.
 */
export type ConnectResultIntent =
  | { kind: "sessionError"; code: ConnectSessionErrorCode }
  | { kind: "itemFailure"; outcome: WhatsappConnectOutcome }
  | {
      kind: "selection"
      signupSessionId: string
      phoneNumbers: WhatsappPhoneNumberOption[]
    }
  | { kind: "toastError"; messageKey: MessageKey }
  | {
      kind: "connected"
      workspaceId: string
      redirectUrl: string
      outcome: WhatsappConnectOutcome
    }

export function toConnectResultIntent(
  data: ConnectWhatsappResult,
): ConnectResultIntent {
  if ("kind" in data) {
    if (data.kind === "sessionError") {
      return { kind: "sessionError", code: data.code }
    }
    return { kind: "itemFailure", outcome: data.outcome }
  }

  switch (data.type) {
    case CONNECT_WHATSAPP_RESULT_TYPES.PHONE_NUMBER_SELECTION:
      return {
        kind: "selection",
        signupSessionId: data.signupSessionId,
        phoneNumbers: data.phoneNumbers,
      }
    case CONNECT_WHATSAPP_RESULT_TYPES.NO_PHONE_NUMBER_CANDIDATES:
      return {
        kind: "toastError",
        messageKey: "fields.phoneNumberId.noPhoneNumbersFound",
      }
    case CONNECT_WHATSAPP_RESULT_TYPES.PHONE_NUMBERS_ALREADY_CONNECTED:
      return {
        kind: "toastError",
        messageKey: "channels.duplicated.whatsapp",
      }
    case CONNECT_WHATSAPP_RESULT_TYPES.CONNECTED:
      return {
        kind: "connected",
        workspaceId: data.workspaceId,
        redirectUrl: data.redirectUrl,
        outcome: data.outcome,
      }
    default: {
      const exhaustiveCheck: never = data
      return exhaustiveCheck
    }
  }
}
