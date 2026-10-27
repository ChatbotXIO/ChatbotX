import {
  hasOwnCredentialAccess,
  tenantService,
  userQuotaService,
} from "@chatbotx.io/business"
import { notFound } from "next/navigation"
import { cache } from "react"
import { getCurrentUser } from "@/lib/auth/utils"

export const getManageAccess = cache(async () => {
  const user = await getCurrentUser()
  if (!user) {
    return {
      user,
      tenant: undefined,
      quota: undefined,
      canManageCredentials: false,
      canManageReseller: false,
    }
  }

  const [tenant, quota] = await Promise.all([
    tenantService.findByOwner(user.id),
    userQuotaService.getForUser(user.id),
  ])
  return {
    user,
    tenant,
    quota,
    canManageCredentials: hasOwnCredentialAccess(tenant, quota),
    canManageReseller: tenant?.status === "active",
  }
})

export async function requireActiveReseller(): Promise<void> {
  const { canManageReseller } = await getManageAccess()
  if (!canManageReseller) {
    notFound()
  }
}
