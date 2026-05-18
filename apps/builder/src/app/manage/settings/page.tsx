import { organizationService } from "@chatbotx.io/business"
import { notFound } from "next/navigation"
import { OrganizationSettings } from "@/features/organization-settings/settings/organization-settings"
import { getDomainFromHeader } from "@/lib/domain"

export default async function OrganizationSettingsPage() {
  const domain = await getDomainFromHeader()
  const organization = await organizationService.findByDomain(domain)
  if (!organization) {
    return notFound()
  }

  return <OrganizationSettings organization={organization} />
}
