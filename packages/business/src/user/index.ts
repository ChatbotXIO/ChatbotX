import { db, eq } from "@chatbotx.io/database/client"
import { userModel } from "@chatbotx.io/database/schema"
import type { UserModel } from "@chatbotx.io/database/types"
import { tenantService } from "../enterprise/tenant/service"
import { isCloud, keys } from "../keys"

/**
 * Clear the forced-password-change gate for a user. Called server-side ONLY
 * after better-auth has verified the current password and applied the change —
 * never expose a standalone "clear the flag" path to clients, or a provisioned
 * account could keep its temporary password.
 */
export const clearMustChangePassword = async (
  userId: string,
): Promise<void> => {
  await db
    .update(userModel)
    .set({ mustChangePassword: false })
    .where(eq(userModel.id, userId))
}

export const isPlatformAdmin = async (
  user: Pick<UserModel, "id" | "email">,
): Promise<boolean> => {
  if (isCloud()) {
    const setting = await tenantService.findByOwner(user.id)
    return Boolean(setting?.status === "active")
  }
  const { PLATFORM_ADMIN_EMAIL } = keys()
  return Boolean(PLATFORM_ADMIN_EMAIL && user.email === PLATFORM_ADMIN_EMAIL)
}

/**
 * The real SaaS operator (super admin), identified by PLATFORM_ADMIN_EMAIL in
 * every edition (cloud included). Distinct from `isPlatformAdmin`, which in
 * cloud means "white-label user". The super admin manages the platform-scoped
 * (NULL userId) default credentials that serve non-white-label customers.
 */
export const isSuperAdmin = (user: Pick<UserModel, "email">): boolean => {
  const { PLATFORM_ADMIN_EMAIL } = keys()
  return Boolean(PLATFORM_ADMIN_EMAIL && user.email === PLATFORM_ADMIN_EMAIL)
}

export * from "./entitlements"
export * from "./resolve-admin-tenant"
