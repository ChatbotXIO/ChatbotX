import "server-only"

import {
  toConnectItemFailure,
  toConnectSessionError,
} from "@chatbotx.io/business/inbox/connect-outcome"
import type { ConnectWarning } from "@chatbotx.io/business/inbox/connect-outcome-types"
import { logger } from "@/lib/log"
import type { ConnectActionResultWire } from "../schema"

/**
 * Channel-agnostic pieces of the shared per-account connect skeleton (plan
 * §2.4 steps 5-8) — every connect core (Messenger's `connectMessengerPage`, both
 * Instagram actions, and WhatsApp's when it lands) hits the same three
 * outcome literals, the same best-effort follow-up wrapper, and the same
 * outer catch. This file owns that repetition so a fourth channel never has
 * to re-copy it; the provider call + persist sequence in between stays local
 * to each action since that part genuinely differs per channel.
 *
 * Server-only: `toConnectSessionError`/`toConnectItemFailure` pull in
 * `ChatbotXException`/`SdkException`, and `logger` pulls in Pino — neither
 * belongs in a client bundle.
 */

type OutcomeIdentity = {
  /** The provider id the operator picked (page id / IG id / phone number). */
  sourceId: string
  name: string
}

/**
 * Step 5: the picked id isn't in the trusted provider list, or is disabled
 * there. `detail` is an OPTIONAL already-translated sentence for the cases
 * where the reason's own copy ("This item can't be selected.") would leave
 * the operator guessing — it renders under the reason like the provider's
 * sentence does, so it must never carry an untranslated string or raw
 * provider text.
 */
export function notSelectableOutcome({
  sourceId,
  name,
  detail,
}: OutcomeIdentity & { detail?: string }): ConnectActionResultWire {
  return {
    kind: "outcome",
    outcome: {
      sourceId,
      name,
      status: "failed",
      reason: "notSelectable",
      coexistEligible: false,
      ...(detail ? { detail } : {}),
    },
  }
}

/** Step 5: the id already has a live integration — no provider call follows. */
export function duplicatedOutcome({
  sourceId,
  name,
}: OutcomeIdentity): ConnectActionResultWire {
  return {
    kind: "outcome",
    outcome: {
      sourceId,
      name,
      status: "duplicated",
      reason: "alreadyConnected",
      coexistEligible: false,
    },
  }
}

/** Step 8: persisted successfully — `warning` carries a follow-up failure, if any. */
export function connectedOutcome({
  sourceId,
  name,
  integrationId,
  warning,
  coexistEligible,
}: OutcomeIdentity & {
  integrationId: string
  warning: ConnectWarning | undefined
  coexistEligible: boolean
}): ConnectActionResultWire {
  return {
    kind: "outcome",
    outcome: {
      sourceId,
      name,
      status: "connected",
      warning,
      integrationId,
      coexistEligible,
    },
  }
}

/**
 * Step 7: runs the channel's best-effort follow-ups (branding, logo, user
 * info, tag scan, …) after the row is already persisted — a throw here must
 * never fail the action, only downgrade the outcome to a warning. `context`
 * is merged into the log line alongside the error (e.g. `{ integrationId }`)
 * without every caller re-writing the try/catch itself.
 */
export async function runConnectFollowUps(
  run: () => Promise<void>,
  log: { message: string; context?: Record<string, unknown> },
): Promise<ConnectWarning | undefined> {
  try {
    await run()
    return
  } catch (error) {
    logger.warn({ err: error, ...log.context }, log.message)
    return "followUpFailed"
  }
}

/**
 * The outer catch (plan §2.4's final step): a session-level exception stops
 * the whole batch (`toConnectSessionError`), anything else becomes an
 * item-level failure outcome (`toConnectItemFailure`) — logged once here so
 * every action doesn't repeat its own `logger.error` call.
 */
export function toConnectActionFailure(
  error: unknown,
  { sourceId, name, log }: OutcomeIdentity & { log: string },
): ConnectActionResultWire {
  const sessionErrorCode = toConnectSessionError(error)
  if (sessionErrorCode) {
    return { kind: "sessionError", code: sessionErrorCode }
  }

  logger.error({ err: error }, log)
  return {
    kind: "outcome",
    outcome: {
      sourceId,
      name,
      ...toConnectItemFailure(error),
      coexistEligible: false,
    },
  }
}
