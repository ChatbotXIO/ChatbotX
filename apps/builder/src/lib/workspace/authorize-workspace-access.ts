import {
  quotaEnforcementService,
  userQuotaService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { HTTPMethod } from "@orpc/server"
import { ORPCError } from "@orpc/server"
import { isCloud } from "@/env"
import { ADS_CAMPAIGNS_INSIGHTS_PATH } from "@/features/ads-campaign/lib/api-paths"

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
 * doesn't fit a GET (e.g. an array too large for a query string). Each entry
 * here is a deliberate, individually-reviewed exception to "read_only tokens
 * may only GET/HEAD" — never add a route that mutates anything.
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
 *   POST-for-read route.
 */
const READ_ONLY_TOKEN_ALLOWED_POST_PATHS = new Set<string>([
  ADS_CAMPAIGNS_INSIGHTS_PATH,
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
 * oRPC gates: reads and deletes stay open (invariant #14) while mutations are
 * checked against the owner's quota/trial state.
 */
export async function assertWorkspaceOwnerAccessForMethod(props: {
  method: HTTPMethod | undefined
  ownerId: string
}): Promise<void> {
  if (!isWorkspaceMutationMethod(props.method)) {
    return
  }

  const denialReason = await checkWorkspaceOwnerAccess({
    ownerId: props.ownerId,
  })
  if (denialReason) {
    throw workspaceAccessDenialOrpcError(denialReason)
  }
}
