import {
  quotaEnforcementService,
  userQuotaService,
} from "@chatbotx.io/business"
import { isCloud } from "@/env"

export type WorkspaceAccessDenialReason = "trialExpired" | "macLimitReached"

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
 * Owner-quota/trial gate shared by every workspace-scoped entry point (server
 * actions, oRPC session auth, oRPC workspace-token auth). Cloud-only — the
 * self-hosted edition has no quota row and stays unrestricted. Deletion is
 * checked separately by each caller via `isWorkspaceScheduledForDeletion`
 * because it's a distinct, terminal concern that must be evaluated even when
 * quota lookups are skipped (self-hosted, or "allow expired" call sites).
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
