import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { Suspense } from "react"
import { ManageOrganizationSettings } from "@/enterprise/features/organization-settings/manage-organization-settings"
import { findOrganizationByDomain } from "@/features/organization/queries"

export default async function ManageIntegrationsPage() {
  const t = await getTranslations()
  const organization = await findOrganizationByDomain()
  if (!organization) {
    return notFound()
  }

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-lg sm:text-xl">
        {t("integrations.title")}
      </h3>

      <Suspense>
        <ManageOrganizationSettings organization={organization} />
      </Suspense>
    </div>
  )
}
