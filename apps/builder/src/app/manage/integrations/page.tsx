import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { Suspense } from "react"
import { ManageOrganizationSettings } from "@/features/organization-settings/manage-organization-settings"
import { getCurrentUserId } from "@/lib/auth/utils"

export default async function ManageIntegrationsPage() {
  const t = await getTranslations()

  const userId = await getCurrentUserId()
  if (!userId) {
    return notFound()
  }

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-lg sm:text-xl">
        {t("integrations.title")}
      </h3>

      <Suspense>
        <ManageOrganizationSettings userId={userId} />
      </Suspense>
    </div>
  )
}
