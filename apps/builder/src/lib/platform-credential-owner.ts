import "server-only"
import {
  resolveTenantByDomain,
  resolveTenantOwnerId,
} from "@chatbotx.io/auth/tenant"
import { workspaceService } from "@chatbotx.io/business"
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
 * `platformCredentialService.resolveForOwner` and `tenantService
 * .resolveVisibleChannels` both key on `Tenant.ownerId` (via
 * `tenantService.findByOwner`) — pass anything else and they silently fall back
 * to the platform-global credential / policy, with no error.
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

  // Platform host, no (resolvable) workspace: `resolveForOwner`/
  // `resolveVisibleChannels` already split "owns an active tenant" from
  // "plain platform user" via their own `findByOwner` call — re-checking it
  // here would be a redundant read producing no new branch.
  return userId
}

/**
 * Request-scoped tenant-owner lookup, keyed on the `tenantId` string.
 * `cache()` memoizes on argument identity, so the key must be a primitive —
 * caching `resolveOwnerForWorkspace` on its `WorkspaceModel` argument would
 * never hit, because every `workspaceService.find` returns a fresh object
 * (superjson-deserialized from Redis, or a new Drizzle row).
 */
const resolveTenantOwnerIdCached = cache(resolveTenantOwnerId)

/**
 * The tenant-aware owner for a known workspace: its own tenant's owner when
 * it has one, else the workspace's direct owner.
 *
 * `Workspace.tenantId` defaults to `ROOT_TENANT_ID` (see
 * `packages/database/src/schema/workspace.ts`), so a reseller's workspace
 * created before that stamp existed — or by any path that missed it — reads
 * back as root. `workspace.ownerId` is the self-healing fallback for those
 * legacy rows: if the workspace owner themselves owns an active tenant,
 * `resolveForOwner` picks it up the same way it does for the no-workspace
 * case above; if not, it falls back to the platform default. No migration
 * needed.
 *
 * Callers on the same request that resolve the same workspace's tenant all
 * collapse into one `resolveTenantOwnerId` read via the string-keyed cache
 * above; root-tenant workspaces short-circuit with zero I/O.
 */
export async function resolveOwnerForWorkspace(
  workspace: WorkspaceModel,
): Promise<string> {
  if (workspace.tenantId !== ROOT_TENANT_ID) {
    const tenantOwnerId = await resolveTenantOwnerIdCached(workspace.tenantId)
    if (tenantOwnerId) {
      return tenantOwnerId
    }
  }
  return workspace.ownerId
}
