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
import { withCache } from "@chatbotx.io/redis"
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
 * A failed read carries the error rather than collapsing to `undefined`, so an
 * acting caller can relay what Meta actually said instead of a sentence of
 * ours that says less.
 */
export type MetaCallPermissionsResult =
  | { ok: true; permissions: WhatsappCallPermissionsResponse }
  | { ok: false; error: unknown }

/**
 * Cached GET /{pnid}/call_permissions. Never throws: callers are deciding
 * which control to render, and a failed lookup must leave that decision alone
 * rather than fail the request. Only a successful response is cached, so a
 * fixed credential shows up on the next read instead of waiting out the TTL.
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
    logger.warn(
      { err: error, integrationId: input.integrationId },
      "Whatsapp calling: could not read call permissions from Meta",
    )
    return { ok: false, error }
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
