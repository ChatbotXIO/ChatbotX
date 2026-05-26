import { organizationService } from "@chatbotx.io/business"
import { notFound } from "next/navigation"
import { ManageWorkspacesList } from "@/features/workspaces/components/manage-workspaces-list"
import { listOrgWorkspaces } from "@/features/workspaces/queries/list-org-workspaces"
import { getDomainFromHeader } from "@/lib/domain"

export default async function ManageWorkspacesPage() {
  const domain = await getDomainFromHeader()
  const organization = await organizationService.findByDomain(domain)
  if (!organization) {
    return notFound()
  }

  const workspaces = await listOrgWorkspaces({
    organizationId: organization.id,
  })

  return <ManageWorkspacesList workspaces={workspaces} />
}
