"use client"

import { toast } from "sonner"
import type { ConnectOutcome } from "../schema"
import type { CoexistCallResult } from "./coexist-client"
import type { MessageKey } from "./message-key"
import type { ConnectPickerChannel } from "./registry"
import {
  COEXIST_ROW_STATUS,
  connectFailureMessageKey,
  WARNING_MESSAGE_KEYS,
} from "./row-status"

/**
 * A single connect never renders `ConnectManyDialog`, so every signal the
 * batch dialog would show on a row has to reach the operator as a toast
 * instead. Every message here comes from the same key the row list uses, so
 * the two surfaces say the same thing about the same outcome.
 */

type Translate = (key: MessageKey) => string

/**
 * The translated reason is the headline; the provider's own sentence
 * (`detail`, present on a `providerRejected` outcome) follows it.
 */
export function toastConnectFailure({
  t,
  channel,
  outcome,
}: {
  t: Translate
  channel: ConnectPickerChannel
  outcome: ConnectOutcome
}): void {
  const reason = t(connectFailureMessageKey(channel, outcome))
  toast.error(
    `${outcome.name}: ${outcome.detail ? `${reason} — ${outcome.detail}` : reason}`,
  )
}

/** The amber note the batch dialog shows per row (`WARNING_MESSAGE_KEYS`). */
export function toastConnectWarning({
  t,
  outcome,
}: {
  t: Translate
  outcome: ConnectOutcome
}): void {
  if (!outcome.warning) {
    return
  }
  toast.warning(`${outcome.name}: ${t(WARNING_MESSAGE_KEYS[outcome.warning])}`)
}

/** Coexist was asked for, but the provider does not offer it for this account. */
export function toastCoexistSkipped(t: Translate): void {
  toast.info(t(COEXIST_ROW_STATUS.skipped.labelKey))
}

export function toastCoexistResult({
  t,
  name,
  result,
}: {
  t: Translate
  name: string
  result: CoexistCallResult
}): void {
  if (result.ok) {
    toast.success(t("coexist.success.enabled"))
    return
  }
  // A network/HTTP-level failure was already toasted by `clientErrorHandler`
  // inside the client — toasting again here would announce it twice.
  if (!result.reported) {
    toast.error(`${name}: ${result.text}`)
  }
}
