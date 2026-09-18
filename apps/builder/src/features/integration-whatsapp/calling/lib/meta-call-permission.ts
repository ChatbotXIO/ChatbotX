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
 * Meta is the ONLY authority on call permission; `WhatsappCallPermission` is
 * a mirror fed by the `call_permission_reply` webhook. The mirror can be
 * legitimately empty for a contact Meta would happily let us call — it is
 * wiped by a table-recreating migration, it never existed for a workspace
 * that connected after the grant, and Meta also grants permission when the
 * consumer simply CALLS the business, which produces no reply we key on.
 *
 * `initiateOutboundVoipCallAction` has always read Meta directly before
 * dialing; this module gives the surfaces that only ever read the mirror the
 * same authority, so an empty mirror degrades to one cached GET instead of a
 * permanently wrong control.
 */

/**
 * Short on purpose. The window this covers is "mirror says nothing", which
 * ends the moment a reply webhook lands, so a long TTL would only prolong a
 * stale negative. Meta allows 5 requests/second on this endpoint and one
 * conversation open costs at most one GET per minute per contact.
 */
const META_CALL_PERMISSION_CACHE_TTL_SECONDS = 60

/**
 * Keyed by integration AND contact inbox: permission is granted to one
 * business number by one consumer, so the same contact on a second connected
 * number is a genuinely different answer.
 */
export const metaCallPermissionCacheKey = (
  integrationId: string,
  contactInboxId: string,
): string => `whatsapp-call-permissions:${integrationId}:${contactInboxId}`

/**
 * Meta's `permission.status` in the local mirror's vocabulary. Declared as a
 * lookup rather than a branch so a new Meta status is a one-line addition
 * that TypeScript demands at the same time it widens the response type.
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
 * Cached `GET /{pnid}/call_permissions`. Resolves to `undefined` — never
 * throws — when Meta is unreachable or rejects the token: every caller here
 * is deciding which control to RENDER, and a failed lookup must leave that
 * decision where it was rather than fail the surrounding request. Only a
 * successful response is cached, so a fixed credential is reflected on the
 * next read instead of waiting out the TTL.
 */
export const readMetaCallPermissions = async (
  input: ReadMetaCallPermissionsInput,
): Promise<WhatsappCallPermissionsResponse | undefined> => {
  try {
    return await withCache(
      metaCallPermissionCacheKey(input.integrationId, input.contactInboxId),
      () => getCallPermissions(input.auth, input.target),
      { ttl: META_CALL_PERMISSION_CACHE_TTL_SECONDS },
    )
  } catch (error) {
    logger.warn(
      { err: error, integrationId: input.integrationId },
      "Whatsapp calling: could not read call permissions from Meta",
    )
    return
  }
}

/**
 * The response's permission status in local terms, or `undefined` when Meta
 * sent no status or one outside
 * {@link CALL_PERMISSION_STATUS_BY_META_STATUS}. This is wire data reached on
 * every conversation open, so an unexpected shape degrades to "unknown" (the
 * caller's existing no-record behaviour) rather than throwing out of a
 * request that had nothing to do with permission.
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
 * Whether Meta will accept another `call_permission_request` for this
 * consumer right now. Meta caps these at 1 per 24 hours and 2 per 7 days and
 * reports the remaining budget on the action itself, so this is the real
 * limit rather than a second counter of our own that could drift from it.
 */
export const canSendCallPermissionRequest = (
  response: WhatsappCallPermissionsResponse,
): boolean => canPerformCallAction(response, "send_call_permission_request")
