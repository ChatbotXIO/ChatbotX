import { ThreadControlUnsupportedError } from "@chatbotx.io/business"
import {
  ChatbotXException,
  toPublicErrorMessage,
} from "@chatbotx.io/business/errors"
import type { ThreadControlAction } from "@chatbotx.io/database/partials"
import { ChannelError, ThreadControlTakeRefusedError } from "@chatbotx.io/sdk"
import {
  THREAD_CONTROL_NOT_ESCALATION,
  type ThreadControlRefusal,
} from "./thread-control-result"

type Translate = (
  key:
    | "conversationRouting.errors.unsupported"
    | "conversationRouting.errors.actionFailed",
) => string

/**
 * Maps a failed take/release/pass for the UI. Channel-agnostic on purpose:
 * the channel decides which of its errors is a take refusal (WhatsApp:
 * `2494191`, only the escalation partner may take) and throws it as
 * `ThreadControlTakeRefusedError`; this only decides how the inbox shows it.
 * - a refused `take` → the inline refusal (returned),
 * - an unsupported channel → a translated error,
 * - any other channel error → Meta's sanitized sentence, or a generic one,
 * - anything else is rethrown unchanged (logged by the action client).
 */
export function mapThreadControlError(
  error: unknown,
  action: ThreadControlAction,
  t: Translate,
): ThreadControlRefusal {
  if (error instanceof ThreadControlUnsupportedError) {
    throw new ChatbotXException(
      t("conversationRouting.errors.unsupported"),
      "threadControlUnsupported",
      400,
    )
  }
  if (!(error instanceof ChannelError)) {
    throw error
  }
  if (action === "take" && error instanceof ThreadControlTakeRefusedError) {
    return { status: THREAD_CONTROL_NOT_ESCALATION }
  }
  throw new ChatbotXException(
    toPublicErrorMessage(error, t("conversationRouting.errors.actionFailed")),
    "threadControlFailed",
    400,
  )
}
