import type { PlatformAdminList } from "@chatbotx.io/business"
import { isSuperAdmin, platformAdminService } from "@chatbotx.io/business"
import { notFound } from "next/navigation"
import { getCurrentUser } from "@/lib/auth/utils"

export const listPlatformAdmins = async (
  page: number,
): Promise<PlatformAdminList> => {
  const user = await getCurrentUser()
  if (!(user && (await isSuperAdmin(user)))) {
    return notFound()
  }

  return await platformAdminService.list({ page, perPage: 50 })
}
