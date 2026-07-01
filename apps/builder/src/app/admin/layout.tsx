import { hasEnterpriseFeatures, isSuperAdmin } from "@chatbotx.io/business"
import { notFound } from "next/navigation"
import { AdminSidebar } from "@/features/admin/components/admin-sidebar"
import { ManageLayout } from "@/features/manage/manage-layout"
import { enforcePasswordCurrent } from "@/lib/auth/require-password-current"
import { getCurrentUser } from "@/lib/auth/utils"

/**
 * Platform-operator console. Gated to the real platform admin
 * (PLATFORM_ADMIN_EMAIL) in every edition.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()
  if (!(user && isSuperAdmin(user))) {
    return notFound()
  }

  enforcePasswordCurrent(user)
  const showEnterpriseItems = await hasEnterpriseFeatures()

  return (
    <ManageLayout
      sidebar={<AdminSidebar showEnterpriseItems={showEnterpriseItems} />}
    >
      {children}
    </ManageLayout>
  )
}
