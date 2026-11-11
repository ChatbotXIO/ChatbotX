import { ROOT_TENANT_ID } from "@chatbotx.io/database/partials"
import { tenantService } from "./service"

/** Whose tenant an admin screen manages: a reseller's own, or the platform's root. */
export type TenantAdminScope =
  | { kind: "owner"; ownerId: string }
  | { kind: "root" }

/** The tenant a scope names; never taken from client input. `null` for an owner with no tenant. */
export const resolveTenantAdminScope = async (
  scope: TenantAdminScope,
): Promise<string | null> => {
  if (scope.kind === "root") {
    return ROOT_TENANT_ID
  }
  return (await tenantService.findByOwner(scope.ownerId))?.id ?? null
}
