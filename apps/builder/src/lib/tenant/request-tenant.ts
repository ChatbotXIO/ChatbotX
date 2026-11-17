import "server-only"
import { resolveTenantByDomain } from "@chatbotx.io/auth/tenant"
import { getDomainFromHeader } from "@/lib/domain"

/**
 * Tenant of the host this request came in on, resolved server-side from the
 * proxy's `x-domain` header. Never accept a tenant id from the client.
 */
export async function resolveRequestTenantId(): Promise<string> {
  return await resolveTenantByDomain(await getDomainFromHeader())
}
