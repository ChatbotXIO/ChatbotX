import { notFound } from "next/navigation"
import AdminIntegrationsDetail from "@/features/admin/integrations/detail"
import {
  findOrganizationByDomain,
  verifyOrganizationSettings,
} from "@/features/organization/queries"

export default async function AdminIntegrationsPage() {
  const organization = await findOrganizationByDomain()

  if (!organization) {
    return notFound()
  }

  const settings = await verifyOrganizationSettings(organization)

  return <AdminIntegrationsDetail settings={settings} />
}
