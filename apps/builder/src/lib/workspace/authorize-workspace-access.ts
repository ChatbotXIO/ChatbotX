import {
  quotaEnforcementService,
  userQuotaService,
} from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import type { HTTPMethod } from "@orpc/server"
import { ORPCError } from "@orpc/server"
import { isCloud } from "@/env"

export type WorkspaceAccessDenialReason = "trialExpired" | "macLimitReached"

const DENIAL_MESSAGES: Record<WorkspaceAccessDenialReason, string> = {
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
 * Distinct from `isWorkspaceMutationMethod`: that predicate treats DELETE as
 * non-mutation for the trial-expired invariant above, but a read_only
 * WorkspaceApiToken must never be allowed to delete data. Keep the two
 * predicates separate rather than reusing one for both call sites.
 */
export const isReadOnlyTokenAllowedMethod = (method: HTTPMethod | undefined) =>
  READ_ONLY_TOKEN_ALLOWED_METHODS.has(method ?? "POST")

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
