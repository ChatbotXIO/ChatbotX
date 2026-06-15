import { tenantService } from "@chatbotx.io/business"
import { notFound } from "next/navigation"
import { env, isCloud } from "@/env"
import { ManageLayout } from "@/features/manage/manage-layout"
import { getCurrentUser } from "@/lib/auth/utils"

export default async function ManageLayoutPage({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()
  if (!user) {
    return notFound()
  }

  /**
   * Cloud edition only allows access to the platform settings page if the user is the platform admin.
   * Enterprise and Community edition allows access to the platform settings page if the user is the platform admin.
   */
  if (isCloud()) {
    const setting = await tenantService.findByOwner(user.id)
    if (setting?.status !== "active") {
      return notFound()
    }
  } else if (
    !env.PLATFORM_ADMIN_EMAIL ||
    user.email !== env.PLATFORM_ADMIN_EMAIL
  ) {
    return notFound()
  }

  return <ManageLayout showEnterpriseItems={isCloud()}>{children}</ManageLayout>
}
