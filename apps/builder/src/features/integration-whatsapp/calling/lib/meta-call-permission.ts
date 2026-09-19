import {
  type CallPermissionStatus,
  callPermissionStatuses,
} from "@chatbotx.io/business"
import type { WhatsappAuthValue } from "@chatbotx.io/integration-whatsapp"
import {
  canPerformCallAction,
  getCallPermissions,
  type WhatsappCallPermissionsResponse,
  type WhatsappCallPermissionsTarget,
} from "@chatbotx.io/integration-whatsapp/api/calling"
import { WHATSAPP_CALLING_ERROR_CODES } from "@chatbotx.io/integration-whatsapp/constants"
import { withCache } from "@chatbotx.io/redis"
import { SdkException } from "@chatbotx.io/sdk"
import { logger } from "@/lib/log"

/**
 * Meta is the only authority on call permission; WhatsappCallPermission is a mirror fed by the
 * call_permission_reply webhook and can be legitimately empty for a contact Meta would still
 * allow (e.g. workspace connected after the grant). This module gives mirror-only surfaces the
 * same authority as initiateOutboundVoipCallAction, so an empty mirror degrades to one cached
 * GET rather than a permanently wrong control.
 */

/**
 * Short on purpose: this window is "mirror says nothing", which ends the moment
 * a reply webhook lands, so a long TTL would only prolong a stale negative.
 * Meta allows 5 req/s on this endpoint and one conversation open costs at most
 * one GET per minute per contact.
 */
const META_CALL_PERMISSION_CACHE_TTL_SECONDS = 60

/**
 * Keyed by integration and contact inbox: permission is granted to one business
 * number by one consumer, so the same contact on a second connected number is a
 * genuinely different answer.
 */
export const metaCallPermissionCacheKey = (
  integrationId: string,
  contactInboxId: string,
): string => `whatsapp-call-permissions:${integrationId}:${contactInboxId}`

/**
 * Meta's permission.status in the local mirror's vocabulary. A lookup rather
 * than a branch so a new Meta status is a one-line addition TypeScript
 * enforces.
 */
const CALL_PERMISSION_STATUS_BY_META_STATUS: Record<
  WhatsappCallPermissionsResponse["permission"]["status"],
  CallPermissionStatus
> = {
  no_permission: callPermissionStatuses.noPermission,
  temporary: callPermissionStatuses.temporary,
  permanent: callPermissionStatuses.permanent,
}

export type ReadMetaCallPermissionsInput = {
  auth: WhatsappAuthValue
  integrationId: string
  contactInboxId: string
  target: WhatsappCallPermissionsTarget
}

/**
 * Meta answering "this account may not place business-initiated calls at all"
 * (country restriction or account eligibility). Reported with
 * `is_transient: false`, so it is a settled answer rather than a failed
 * lookup: a retry can never turn it into a yes.
 */
const isBusinessCallingUnavailable = (error: unknown): boolean =>
  error instanceof SdkException &&
  Number(error.code) ===
    WHATSAPP_CALLING_ERROR_CODES.BUSINESS_CALLING_UNAVAILABLE

/**
 * Why a permission read produced no answer. `businessCallingUnavailable` is a
 * definitive no from Meta; `lookupFailed` is everything else (unreachable,
 * rejected token, malformed body) and says nothing about the real permission.
 */
export type MetaCallPermissionsFailure =
  | "businessCallingUnavailable"
  | "lookupFailed"

export type MetaCallPermissionsResult =
  | { ok: true; permissions: WhatsappCallPermissionsResponse }
  | {
      ok: false
      failure: MetaCallPermissionsFailure
      /**
       * Kept so an acting caller can run it through `toPublicErrorMessage`,
       * which surfaces Meta's own sentence (and its code) rather than a
       * sentence of ours that says less.
       */
      error: unknown
    }

/**
 * Cached GET /{pnid}/call_permissions. Never throws: callers are deciding
 * which control to render or which reason to show, so the outcome is returned
 * as data. The failure is classified rather than collapsed to undefined, so an
 * "account cannot call" answer is not mistaken for "ask again later". Only a
 * successful response is cached, so a fixed credential shows up on the next
 * read instead of waiting out the TTL.
 */
export const readMetaCallPermissions = async (
  input: ReadMetaCallPermissionsInput,
): Promise<MetaCallPermissionsResult> => {
  try {
    const permissions = await withCache(
      metaCallPermissionCacheKey(input.integrationId, input.contactInboxId),
      () => getCallPermissions(input.auth, input.target),
      { ttl: META_CALL_PERMISSION_CACHE_TTL_SECONDS },
    )
    return { ok: true, permissions }
  } catch (error) {
    if (isBusinessCallingUnavailable(error)) {
      logger.info(
        { err: error, integrationId: input.integrationId },
        "Whatsapp calling: Meta reports business-initiated calling unavailable for this number",
      )
      return { ok: false, failure: "businessCallingUnavailable", error }
    }
    logger.warn(
      { err: error, integrationId: input.integrationId },
      "Whatsapp calling: could not read call permissions from Meta",
    )
    return { ok: false, failure: "lookupFailed", error }
  }
}

/**
 * The response's status in local terms, or undefined when Meta sent no status
 * or an unrecognized one. Reached on every conversation open, so an unexpected
 * shape degrades to unknown rather than throwing.
 */
export const toCallPermissionStatus = (
  response: WhatsappCallPermissionsResponse,
): CallPermissionStatus | undefined => {
  const status = response.permission?.status
  return status
    ? (CALL_PERMISSION_STATUS_BY_META_STATUS[status] as
        | CallPermissionStatus
        | undefined)
    : undefined
}

/**
 * Meta's permission.expiration_time as Unix seconds, when sent. Meta types it
 * as number-or-string, and only a temporary grant carries it.
 */
export const toPermissionExpirationTimestamp = (
  response: WhatsappCallPermissionsResponse,
): number | undefined => {
  const raw = response.permission?.expiration_time
  if (raw === undefined || raw === null) {
    return
  }
  const seconds = Number(raw)
  return Number.isFinite(seconds) ? seconds : undefined
}

/**
 * Whether Meta will accept another call_permission_request for this consumer
 * right now. Meta caps these at 1/24h and 2/7d and reports the remaining budget
 * on the action itself, so this is the real limit rather than a second counter
 * that could drift from it.
 */
export const canSendCallPermissionRequest = (
  response: WhatsappCallPermissionsResponse,
): boolean => canPerformCallAction(response, "send_call_permission_request")
