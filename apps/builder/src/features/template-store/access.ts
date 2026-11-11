import "server-only"

import { isSuperAdmin, type TenantAdminScope } from "@chatbotx.io/business"
import { notFound } from "next/navigation"
import { getManageAccess } from "@/app/manage/reseller-guard"
import { getCurrentUser } from "@/lib/auth/utils"
import type { TemplateStoreScope } from "./schema"

/**
 * The tenant scope of an admin screen, re-checked where the data is read:
 * layouts are not an authorization boundary (a page can render without them).
 * A visitor who may not manage that store gets a 404.
 */
export const requireTemplateStoreScope = async (
  scopeKind: TemplateStoreScope,
): Promise<TenantAdminScope> => {
  if (scopeKind === "platform") {
    const user = await getCurrentUser()
    return user && (await isSuperAdmin(user)) ? { kind: "root" } : notFound()
  }
  const { user, canManageReseller } = await getManageAccess()
  return user && canManageReseller
    ? { kind: "owner", ownerId: user.id }
    : notFound()
}
