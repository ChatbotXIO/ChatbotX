import "server-only"
import {
  resolveTenantByDomain,
  resolveTenantOwnerId,
} from "@chatbotx.io/auth/tenant"
import {
  resolveCredentialOwnerIdForWorkspace,
  workspaceService,
} from "@chatbotx.io/business"
import { ROOT_TENANT_ID } from "@chatbotx.io/database/partials"
import type { WorkspaceModel } from "@chatbotx.io/database/types"
import { cache } from "react"
import { isCloud } from "@/env"
import { getDomainFromHeader } from "@/lib/domain"

/**
 * The `User.id` whose platform-credential set (Meta/WhatsApp/Zalo/TikTok OAuth
 * app) a channel connect must use, and whose tenant's channel-visibility policy
 * applies.
 *
 * `platformCredentialService.resolveForOwner` must receive the tenant owner
 * for a reseller workspace. `resolveOwnerForWorkspace` delegates to the
 * business helper so builder and worker credential resolution agree.
 *
 * Resolution order — the request's host wins over an explicit `workspaceId`:
 *   1. Non-cloud editions are single-tenant — always the current user.
 *   2. An active white-label custom domain — that domain's tenant owner.
 *   3. A known workspace on the platform host — its (tenant-aware) owner.
 *   4. Otherwise — the current user, letting `resolveForOwner` itself decide
 *      between "owns an active tenant" and "plain platform user".
 *
 * Host-first is safe across the OAuth broker hop: `callback.ts`'s white-label
 * relay restores the branded origin (from the `state`'s required `referer`)
 * before any credential is resolved, so `x-domain` is already correct by the
 * time this runs on the completion leg. Do not reorder workspace above host —
 * that would make the completion leg (which runs post-relay, host-correct)
 * disagree with a start leg computed before this fix.
 */
export async function resolvePlatformOwnerId(props: {
  userId: string
  workspaceId?: string | null
}): Promise<string> {
  const { userId, workspaceId } = props

  if (!isCloud()) {
    return userId
  }

  const domainTenantId = await resolveTenantByDomain(
    await getDomainFromHeader(),
  )
  if (domainTenantId !== ROOT_TENANT_ID) {
    return (await resolveTenantOwnerIdCached(domainTenantId)) ?? userId
  }

  if (workspaceId) {
    const workspace = await workspaceService.find({
      where: { id: workspaceId },
    })
    if (workspace) {
      return resolveOwnerForWorkspace(workspace)
    }
  }

  // Platform host, no (resolvable) workspace: let `resolveForOwner` select the
  // user's own credential or the platform default.
  return userId
}

/**
 * Request-scoped tenant-owner lookup keyed on `tenantId`.
 */
const resolveTenantOwnerIdCached = cache(resolveTenantOwnerId)

/**
 * Request-scoped credential-owner lookup keyed only on primitive workspace
 * fields. Passing a `WorkspaceModel` directly would miss because workspace
 * reads return fresh objects.
 */
const resolveCredentialOwnerIdForWorkspaceCached = cache(
  async (workspaceId: string, tenantId: string, ownerId: string) =>
    await resolveCredentialOwnerIdForWorkspace(workspaceId, {
      tenantId,
      ownerId,
    }),
)

/**
 * The credential owner for a known workspace, resolved by the shared business
 * helper so every caller applies the same tenant-owner rule.
 */
export async function resolveOwnerForWorkspace(
  workspace: WorkspaceModel,
): Promise<string> {
  return await resolveCredentialOwnerIdForWorkspaceCached(
    workspace.id,
    workspace.tenantId,
    workspace.ownerId,
  )
}
