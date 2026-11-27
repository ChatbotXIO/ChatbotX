import "server-only"
import { resolveTenantByDomain } from "@chatbotx.io/auth/tenant"
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

/**
 * A workspace is reachable only on the host of its own tenant: a tenant's
 * white-label domain shows that tenant's workspaces, the platform host shows
 * root-tenant ones.
 */
export function isWorkspaceVisibleOnHost(
  workspaceTenantId: string,
  hostTenantId: string,
): boolean {
  return workspaceTenantId === hostTenantId
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
  isSupportSession: boolean
}): boolean {
  if (props.isSupportSession && props.hostTenantId === ROOT_TENANT_ID) {
    return true
  }
  return isWorkspaceVisibleOnHost(props.workspaceTenantId, props.hostTenantId)
}

export function filterWorkspacesForHost<T extends { tenantId: string }>(
  items: readonly T[],
  hostTenantId: string,
): T[] {
  return items.filter((item) =>
    isWorkspaceVisibleOnHost(item.tenantId, hostTenantId),
  )
}
