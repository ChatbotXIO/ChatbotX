import { isSuperAdmin } from "@chatbotx.io/business"
import { notFound } from "next/navigation"
import { isCloud } from "@/env"
import { AdminSidebar } from "@/features/admin/components/admin-sidebar"
import { ManageLayout } from "@/features/manage/manage-layout"
import { enforcePasswordCurrent } from "@/lib/auth/require-password-current"
import { getCurrentUser } from "@/lib/auth/utils"

/**
 * SaaS-operator console. Gated to the real platform admin
 * (PLATFORM_ADMIN_EMAIL) and only meaningful in cloud — self-hosted admins
 * already manage the platform-scoped credentials through `/manage`.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()
  if (!(user && isCloud() && isSuperAdmin(user))) {
    return notFound()
  }

  enforcePasswordCurrent(user)

  return <ManageLayout sidebar={<AdminSidebar />}>{children}</ManageLayout>
}
