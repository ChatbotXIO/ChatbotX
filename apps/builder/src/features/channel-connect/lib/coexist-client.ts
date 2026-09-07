import { clientErrorHandler } from "@/lib/errors/client-handler"
import {
  COEXIST_REASON_MESSAGE_KEYS,
  isCoexistKnownReason,
} from "./coexist-reasons"
import type { MessageKey } from "./message-key"
import { COEXIST_SETTERS, type ConnectPickerChannel } from "./registry"

/**
 * One coexist POST's outcome. `text` is already translated and safe to show.
 * `reported` says whether the failure has ALREADY been surfaced to the
 * operator as a toast (`clientErrorHandler` does that for network/HTTP-level
 * errors) — a caller that toasts failures itself must skip those, or the same
 * failure is announced twice. A row's sub-line shows `text` either way.
 */
export type CoexistCallResult =
  | { ok: true }
  | { ok: false; text: string; reported: boolean }

export type SetCoexistParams = {
  workspaceId: string
  channel: ConnectPickerChannel
  integrationId: string
  enabled: boolean
  aiReadsSyncedHistory: boolean
  /**
   * The caller's `useTranslations()` — the failure copy is resolved here so
   * every surface (batch row sub-line, single-path toast) shows the same text
   * for the same failure.
   */
  t: (key: MessageKey) => string
}

/** `result.msg` wins when present; otherwise a known `reason` maps to its translated copy, else a generic fallback. */
function failureText(
  result: { reason?: string; msg?: string },
  t: (key: MessageKey) => string,
): string {
  if (result.msg) {
    return result.msg
  }
  if (result.reason && isCoexistKnownReason(result.reason)) {
    return t(COEXIST_REASON_MESSAGE_KEYS[result.reason])
  }
  return t("coexist.errors.unknown")
}

/**
 * Calls one integration's coexist procedure — the same body and failure
 * precedence the coexist step used, lifted out of the UI so both the batch
 * runner (`useConnectBatch`'s `afterConnect`) and the single-item flow share
 * one implementation. Coexist semantics themselves are unchanged; only the
 * transport moved, from a `/api` URL (now `publicRouter`-only, so it 404s) to
 * the typed oRPC client. `COEXIST_SETTERS` keeps the channel names in
 * `registry.ts`, so this file never spells one.
 */
export async function setCoexist({
  workspaceId,
  channel,
  integrationId,
  enabled,
  aiReadsSyncedHistory,
  t,
}: SetCoexistParams): Promise<CoexistCallResult> {
  try {
    const result = await COEXIST_SETTERS[channel]({
      workspaceId,
      integrationId,
      enabled,
      aiReadsSyncedHistory,
    })

    return result.success
      ? { ok: true }
      : { ok: false, text: failureText(result, t), reported: false }
  } catch (error) {
    // `clientErrorHandler` already toasts the network/HTTP-level error, so
    // this failure is reported: the returned text is only for the row's own
    // sub-line, and a caller that toasts failures must not repeat it.
    await clientErrorHandler(error)
    return { ok: false, text: t("coexist.errors.unknown"), reported: true }
  }
}

/**
 * The result for a coexist call that could not even be attempted — today only
 * when the caller's workspace resolver has nothing to resolve. Never silently
 * skipped: the row's sub-line (batch) or a toast (single) has to say the sync
 * did not start, since the operator did ask for it.
 */
export function coexistUnavailable(
  t: (key: MessageKey) => string,
): CoexistCallResult {
  return { ok: false, text: t("coexist.errors.unknown"), reported: false }
}
