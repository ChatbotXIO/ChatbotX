import { isSuperAdmin } from "@chatbotx.io/business"
import { notFound } from "next/navigation"
import { getCurrentUser } from "@/lib/auth/utils"

/**
 * Shared guard for platform-wide (cross-workspace) admin reads: requires a
 * signed-in super admin, or degrades to `notFound()` like the `/admin`
 * layout it backs up. Callers behind a license-gated route group must still
 * call `assertEnterpriseFeatures()` themselves first — this only covers the
 * super-admin check repeated across platform query files.
 */
export async function assertPlatformSuperAdmin(): Promise<void> {
  const user = await getCurrentUser()
  if (!(user && (await isSuperAdmin(user)))) {
    notFound()
  }
}
