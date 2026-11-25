import {
  quotaEnforcementService,
  userQuotaService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { HTTPMethod } from "@orpc/server"
import { ORPCError } from "@orpc/server"
import { isCloud } from "@/env"
import { ADS_CAMPAIGNS_INSIGHTS_PATH } from "@/features/ads-campaign/lib/api-paths"
import { BROADCAST_AUDIENCE_PREVIEW_TOKEN_PATH } from "@/features/broadcasts/lib/api-paths"
import {
  CHANNEL_POST_MERGE_VIEW_POST_PATH,
  CHANNEL_POST_MERGE_VIEW_TOKEN_PATH,
} from "@/features/channel-posts/lib/api-paths"
import {
  FILTER_VALUE_LABELS_POST_PATH,
  FILTER_VALUE_LABELS_TOKEN_PATH,
} from "@/features/contact-filter/lib/api-paths"
import { CONVERSATIONS_LIST_POST_PATH } from "@/features/conversations/lib/api-paths"
import {
  POST_FEED_BULK_DELETE_POST_PATH,
  POST_FEED_BULK_DELETE_TOKEN_PATH,
  POST_FEED_PAUSE_POST_PATH,
  POST_FEED_PAUSE_TOKEN_PATH,
} from "@/features/social-post-feeds/lib/api-paths"
import {
  SOCIAL_POST_PREVIEW_POST_PATH,
  SOCIAL_POST_PREVIEW_TOKEN_PATH,
  SOCIAL_POST_RECURRENCE_PAUSE_POST_PATH,
  SOCIAL_POST_RECURRENCE_PAUSE_TOKEN_PATH,
  SOCIAL_POST_UNSCHEDULE_POST_PATH,
  SOCIAL_POST_UNSCHEDULE_TOKEN_PATH,
  SOCIAL_POST_VALIDATE_POST_PATH,
  SOCIAL_POST_VALIDATE_TOKEN_PATH,
} from "@/features/social-posts/lib/api-paths"

export type WorkspaceAccessDenialReason = "trialExpired" | "macLimitReached"

export const DENIAL_MESSAGES: Record<WorkspaceAccessDenialReason, string> = {
  trialExpired: "Trial expired",
  macLimitReached: "Monthly active contact limit reached",
}

const DENIAL_HTTP_STATUS = 403

/**
 * HTTP methods that may run against a workspace whose owner is trial-expired
 * or over the MAC limit. Mirrors AGENTS.md invariant #14: such workspaces are
 * read/delete-only, never locked out — so GET/HEAD/DELETE stay open while
 * POST/PUT/PATCH are gated. A procedure with no declared method is treated as
 * a mutation (oRPC defaults undeclared routes to POST).
 */
const READ_OR_DELETE_METHODS = new Set<HTTPMethod>(["GET", "HEAD", "DELETE"])

export const isWorkspaceMutationMethod = (method: HTTPMethod | undefined) =>
  !READ_OR_DELETE_METHODS.has(method ?? "POST")

const READ_ONLY_TOKEN_ALLOWED_METHODS = new Set<HTTPMethod>(["GET", "HEAD"])

/**
 * POST-for-read routes: pure reads that use POST only because their input
 * doesn't fit a GET (e.g. an array too large for a query string, or a
 * cursor-pagination body). Each entry is a deliberate, individually-reviewed
 * exception — never add a route here that mutates anything.
 *
 * The two allow-lists below (`READ_ONLY_TOKEN_ALLOWED_POST_PATHS` and
 * `READ_ONLY_POST_PATHS`) are NOT the same list: a route can be a read for
 * the trial/MAC-limit gate (invariant #14 — every read stays open regardless
 * of caller) without also being safe to expose to a `read_only`
 * WorkspaceApiToken (a narrower, separately-reviewed capability). Each path
 * opts into each Set below individually.
 *
 * - `ADS_CAMPAIGNS_INSIGHTS_PATH` (`/v1/ads/campaigns/insights`): `adIds` can
 *   carry up to `MAX_INSIGHTS_AD_IDS` (500) entries, too large to safely fit
 *   a GET query string across every proxy/client.
 *   `messagingAdCampaignService.listInsights` performs no writes on any
 *   success path — it only reads (optionally refreshing a Graph-backed
 *   cache). On a Graph-190 expired-token error, though,
 *   `withTokenInvalidation` (`messaging-ads-connection/graph-reads.ts`)
 *   transitively writes `MessagingAdsConnection.status = "invalid"` via
 *   `markInvalid` — the same cache-refresh write path every cached Graph
 *   read (including plain GETs) already shares, not a hole specific to this
 *   POST-for-read route. Allow-listed for read_only tokens only — it has
 *   never been reviewed against the trial/MAC-limit gate, so it stays out of
 *   `READ_ONLY_POST_PATHS`.
 * - `CONVERSATIONS_LIST_POST_PATH` (`/workspaces/{workspaceId}/conversations/list`):
 *   cursor-pagination body, no writes on any path. Allow-listed for the
 *   trial gate only — not yet reviewed for read_only-token exposure, so it
 *   stays out of `READ_ONLY_TOKEN_ALLOWED_POST_PATHS` until that review
 *   happens.
 * - `FILTER_VALUE_LABELS_POST_PATH`
 *   (`/workspaces/{workspaceId}/contact-filter/value-labels`): up to 100 ids
 *   per entity type, too large for a GET query string. Primary-key lookups
 *   that only read, so the filter's names keep resolving on a trial-expired
 *   workspace. Trial gate only — not reviewed for read_only-token exposure.
 * - `BROADCAST_AUDIENCE_PREVIEW_TOKEN_PATH`
 *   (`/v1/broadcasts/audience/preview`): the audience filter is a JSON
 *   body, so POST. They only select contact inboxes and never write, so they
 *   stay open on a trial-expired workspace. They are NOT allow-listed for
 *   `read_only` tokens: unlike `broadcasts.getAudience` (bounded by broadcasts
 *   that already exist) they page every contact of the workspace and accept
 *   an arbitrary `contactFilter`.
 * - Composed-post dry runs (`/v1/posts/validate`, `/v1/posts/preview` and the
 *   session twins `/workspaces/{workspaceId}/social-posts/{validate,preview}`):
 *   the post is a JSON body, so POST. They check and describe a post against
 *   the network rules and the workspace's own files and accounts, and write
 *   nothing (no import, no row). Open on a trial-expired workspace (invariant
 *   14) and for `read_only` tokens: they reveal nothing a GET of the accounts
 *   and files does not.
 * - Comments of several posts (`/v1/channel-posts/management/merge-view` and
 *   its session twin): the post ids are a body, so POST; one bounded page of
 *   the same comments `GET .../{id}/comments` returns, with the same phone
 *   redaction. Open on a trial-expired workspace and for `read_only` tokens.
 * - Comment export (`/v1/channel-posts/management/export`; the web page
 *   downloads through a GET route instead): builds a CSV of up to 20,000 comments or phone numbers from the
 *   same reads, no data writes, but it consumes a message of the quota, so it
 *   is refused (403 `trialExpired` / `macLimitReached`) on a trial-expired workspace, and NOT open to `read_only`
 *   tokens: like the audience preview it extracts a whole workspace's contact
 *   data in one call rather than page by page.
 */

const READ_ONLY_TOKEN_ALLOWED_POST_PATHS = new Set<string>([
  ADS_CAMPAIGNS_INSIGHTS_PATH,
  // Tag-id -> name lookup only: a primary-key read, no writes.
  FILTER_VALUE_LABELS_TOKEN_PATH,
  // Template previews: reads that use POST for their body.
  "/v1/templates/dependencies-preview",
  "/v1/templates/locked-resources",
  // Composed-post dry runs and the merged comment view: pure reads with a body.
  SOCIAL_POST_VALIDATE_TOKEN_PATH,
  SOCIAL_POST_PREVIEW_TOKEN_PATH,
  CHANNEL_POST_MERGE_VIEW_TOKEN_PATH,
])

/**
 * Distinct from `isWorkspaceMutationMethod`: that predicate treats DELETE as
 * non-mutation for the trial-expired invariant above, but a read_only
 * WorkspaceApiToken must never be allowed to delete data. Keep the two
 * predicates separate rather than reusing one for both call sites.
 *
 * `path` lets a specific POST-for-read route opt in via
 * `READ_ONLY_TOKEN_ALLOWED_POST_PATHS` above — every other POST/PUT/PATCH
 * stays blocked.
 */
export const isReadOnlyTokenAllowedMethod = (
  method: HTTPMethod | undefined,
  path?: string,
) =>
  READ_ONLY_TOKEN_ALLOWED_METHODS.has(method ?? "POST") ||
  (method === "POST" && READ_ONLY_TOKEN_ALLOWED_POST_PATHS.has(path ?? ""))

async function getWorkspaceOwnerAccessState(ownerId: string) {
  const accessState = await userQuotaService.getAccessState(ownerId)
  if (accessState.blocked) {
    return accessState
  }

  // getAccessState already checks ownerId's own live MAC counter, so this is a
  // no-op for a reseller acting directly or a root-tenant owner (isAtLimit
  // reduces to the same isLimitReached(ownerId, "mac") call in both cases). It
  // only adds new information when ownerId is a sub-account: isAtLimit then
  // also checks the reseller pool row, closing a pool-level MAC bypass for
  // workspaces owned by a sub-account. Costs one extra, uncached lookup of the
  // owner's tenant on every call — see resolveContext in quota-enforcement/service.ts.
  if (
    await quotaEnforcementService.isAtLimit({
      userId: ownerId,
      metric: "mac",
    })
  ) {
    return { ...accessState, blocked: true, reason: "mac" as const }
  }

  return accessState
}

/**
 * Owner-quota/trial gate shared by every workspace-scoped entry point: server
 * actions (`workspaceActionClient` in safe-action.ts), oRPC workspace-token
 * auth, and oRPC session auth (`workspaceAuthorizedMidddleware`) all wire
 * this in. Cloud-only — the self-hosted edition has no quota row and stays
 * unrestricted. Deletion is checked separately by each caller via
 * `isWorkspaceScheduledForDeletion` because it's a distinct, terminal concern
 * that must be evaluated even when quota lookups are skipped (self-hosted, or
 * "allow expired" call sites).
 */
export async function checkWorkspaceOwnerAccess(props: {
  ownerId: string
}): Promise<WorkspaceAccessDenialReason | null> {
  if (!isCloud()) {
    return null
  }

  const { blocked, reason } = await getWorkspaceOwnerAccessState(props.ownerId)
  if (!blocked) {
    return null
  }

  return reason === "mac" ? "macLimitReached" : "trialExpired"
}

/** next-safe-action flavour: thrown by `workspaceActionClient` middlewares. */
export const workspaceAccessDenialException = (
  reason: WorkspaceAccessDenialReason,
) => new ChatbotXException(DENIAL_MESSAGES[reason], reason, DENIAL_HTTP_STATUS)

/** oRPC flavour: thrown by the session and workspace-token middlewares. */
export const workspaceAccessDenialOrpcError = (
  reason: WorkspaceAccessDenialReason,
) =>
  new ORPCError(reason, {
    message: DENIAL_MESSAGES[reason],
    status: DENIAL_HTTP_STATUS,
  })

/**
 * Shared by the session (`workspaceAuthorizedMidddleware`) and workspace-token
 * oRPC gates: reads, deletes, and allow-listed POST-for-read routes (see
 * `READ_ONLY_POST_PATHS`) stay open; all other mutations are checked against
 * the owner's quota/trial state. Deliberately NOT the same membership as
 * `READ_ONLY_TOKEN_ALLOWED_POST_PATHS` — see the comments above for why each
 * path opts in independently.
 */
/**
 * Stopping a sending broadcast must stay possible on a trial-expired or
 * over-limit workspace, exactly like the builder's `stopBroadcastAction`
 * (`workspaceActionClientAllowExpired`). It only ever stops work, never starts
 * any. Gate-only allow-list: a `read_only` token still cannot call it.
 */
export const BROADCAST_STOP_TOKEN_PATH = "/v1/broadcasts/{id}/stop"

/**
 * Stopping a Marketing Messages campaign must stay possible on a trial-expired
 * or over-limit workspace, like the builder's `stopMarketingMessageAction`
 * (`workspaceActionClientAllowExpired`). It only stops work and never touches
 * Meta. Gate-only allow-list: a `read_only` token still cannot call it.
 */
export const MARKETING_MESSAGE_STOP_TOKEN_PATH =
  "/v1/marketing-messages/campaigns/{id}/stop"

/**
 * Cancelling an Automatic Customer Scan must stay possible on a trial-expired
 * or over-limit workspace, like the builder's `cancelContactScanAction`
 * (`workspaceActionClientAllowExpired`). It only stops work. Gate-only
 * allow-list: a `read_only` token still cannot call it.
 */
export const CONTACT_SCAN_CANCEL_TOKEN_PATH = "/v1/contact-scans/cancel"

/**
 * Cancelling a Contact Sync, like `cancelContactSyncAction`
 * (`workspaceActionClientAllowExpired`): it only stops work. Gate-only
 * allow-list: a `read_only` token still cannot call it.
 */
const CONTACT_SYNC_CANCEL_TOKEN_PATH = "/v1/contact-syncs/{runId}/cancel"

const READ_ONLY_POST_PATHS = new Set<string>([
  CONVERSATIONS_LIST_POST_PATH,
  FILTER_VALUE_LABELS_POST_PATH,
  FILTER_VALUE_LABELS_TOKEN_PATH,
  BROADCAST_STOP_TOKEN_PATH,
  MARKETING_MESSAGE_STOP_TOKEN_PATH,
  CONTACT_SCAN_CANCEL_TOKEN_PATH,
  CONTACT_SYNC_CANCEL_TOKEN_PATH,
  BROADCAST_AUDIENCE_PREVIEW_TOKEN_PATH,
  // Dry runs of a composed post and the merged comment view: reads that take
  // a body (see the notes above). The comment export is NOT here: it consumes
  // a message of the quota, so an expired workspace is refused (403 `trialExpired`).
  SOCIAL_POST_VALIDATE_TOKEN_PATH,
  SOCIAL_POST_PREVIEW_TOKEN_PATH,
  SOCIAL_POST_VALIDATE_POST_PATH,
  SOCIAL_POST_PREVIEW_POST_PATH,
  CHANNEL_POST_MERGE_VIEW_TOKEN_PATH,
  CHANNEL_POST_MERGE_VIEW_POST_PATH,
  // Pausing a repeating post only stops work: open when trial-expired.
  SOCIAL_POST_RECURRENCE_PAUSE_TOKEN_PATH,
  SOCIAL_POST_RECURRENCE_PAUSE_POST_PATH,
  // Taking a post back to a draft only takes work away: open when trial-expired.
  SOCIAL_POST_UNSCHEDULE_TOKEN_PATH,
  SOCIAL_POST_UNSCHEDULE_POST_PATH,
  // Pausing or deleting feeds only stops work: open when trial-expired.
  POST_FEED_BULK_DELETE_TOKEN_PATH,
  POST_FEED_BULK_DELETE_POST_PATH,
  POST_FEED_PAUSE_TOKEN_PATH,
  POST_FEED_PAUSE_POST_PATH,
  // Template uninstall and its cancel remove or give back copies: a
  // delete/cancel-type action, open on a trial-expired workspace like the UI
  // (invariant 14). Trial gate only — they are writes, never read_only-token.
  "/v1/template-installations/{id}/uninstall",
  "/v1/template-installations/{id}/uninstall/cancel",
  "/v1/templates/{id}/installers/{installerId}/uninstall",
])

export async function assertWorkspaceOwnerAccessForMethod(props: {
  method: HTTPMethod | undefined
  ownerId: string
  path?: string
}): Promise<void> {
  if (
    !isWorkspaceMutationMethod(props.method) ||
    (props.method === "POST" &&
      props.path &&
      READ_ONLY_POST_PATHS.has(props.path))
  ) {
    return
  }

  const denialReason = await checkWorkspaceOwnerAccess({
    ownerId: props.ownerId,
  })
  if (denialReason) {
    throw workspaceAccessDenialOrpcError(denialReason)
  }
}
