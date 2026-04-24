import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { Suspense } from "react"
import { ManageOrganizationSettings } from "@/enterprise/features/organization-settings/manage-organization-settings"
import { organizationService } from "@/features/organization/services"
import { getDomainFromHeader } from "@/lib/domain"

export default async function ManageIntegrationsPage() {
  const t = await getTranslations()

  const domain = await getDomainFromHeader()
  const organization = await organizationService.findByDomain(domain)
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
