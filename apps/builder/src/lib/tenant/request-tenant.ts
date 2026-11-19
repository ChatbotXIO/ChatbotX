import "server-only"
import { resolveTenantByDomain } from "@chatbotx.io/auth/tenant"
import { userService } from "@chatbotx.io/business"
import { ROOT_TENANT_ID } from "@chatbotx.io/database/schema"
import { cache } from "react"
import { getDomainFromHeader } from "@/lib/domain"

/**
 * Tenant of the host this request came in on, resolved server-side from the
 * proxy's `x-domain` header. Never accept a tenant id from the client.
 * Wrapped in `cache()` so a layout and a gate in the same request share one
 * resolution.
 */
export const resolveRequestTenantId = cache(
  async (): Promise<string> =>
    await resolveTenantByDomain(await getDomainFromHeader()),
)

export interface UserTenancy {
  /** The tenant a root-tenant user owns (a reseller), if any. */
  ownedTenantId?: string
  /** The user's own `User.tenantId`. */
  tenantId?: string
}

/**
 * Tenancy of the signed-in user, read once per request. Not the session (it
 * never carries `tenantId`) and not `resolveTenantForOwner` (that returns the
 * tenant a reseller owns, not the one they belong to).
 */
export const resolveRequestUserTenancy = cache(
  async (userId: string): Promise<UserTenancy> =>
    await userService.findTenancy(userId),
)

/**
 * Host rule: a workspace opens when its tenant is the tenant of the host. On
 * the platform (root) host a reseller (a root-tenant user) also opens the
 * workspaces of the tenant they own — where they manage them — but no other
 * tenant's. A sub-account never opens anything on the root host unless the
 * workspace is a root one. Membership is still checked separately.
 */
export function isWorkspaceVisibleOnHost(
  workspaceTenantId: string,
  hostTenantId: string,
  userTenancy?: UserTenancy,
): boolean {
  if (workspaceTenantId === hostTenantId) {
    return true
  }
  return (
    hostTenantId === ROOT_TENANT_ID &&
    userTenancy?.tenantId === ROOT_TENANT_ID &&
    userTenancy.ownedTenantId !== undefined &&
    workspaceTenantId === userTenancy.ownedTenantId
  )
}

/**
 * Host gate for opening a workspace. Platform support (a super admin's
 * synthetic membership) is not host-gated on the root host, since their root
 * account cannot sign in on a tenant domain; on a tenant host it follows the
 * same rule as everyone else.
 */
export function canOpenWorkspaceOnHost(props: {
  workspaceTenantId: string
  hostTenantId: string
  userTenancy?: UserTenancy
  isSupportSession: boolean
}): boolean {
  if (props.isSupportSession && props.hostTenantId === ROOT_TENANT_ID) {
    return true
  }
  return isWorkspaceVisibleOnHost(
    props.workspaceTenantId,
    props.hostTenantId,
    props.userTenancy,
  )
}

export function filterWorkspacesForHost<T extends { tenantId: string }>(
  items: readonly T[],
  hostTenantId: string,
  userTenancy?: UserTenancy,
): T[] {
  return items.filter((item) =>
    isWorkspaceVisibleOnHost(item.tenantId, hostTenantId, userTenancy),
  )
}
