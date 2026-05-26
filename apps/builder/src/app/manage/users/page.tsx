import { organizationService } from "@chatbotx.io/business"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { OrganizationMembersList } from "@/enterprise/features/organization-members/components/organization-members-list"
import { listOrganizationMembers } from "@/enterprise/features/organization-members/queries"
import { listOrganizationMembersSearchParamsCache } from "@/enterprise/features/organization-members/schema/mutation"
import { listOrgWorkspaces } from "@/features/workspaces/queries/list-org-workspaces"
import { getCurrentUser } from "@/lib/auth/utils"
import { getDomainFromHeader } from "@/lib/domain"

type ManageUsersPageProps = {
  searchParams: Promise<SearchParams>
}

export default async function ManageUsersPage(props: ManageUsersPageProps) {
  const t = await getTranslations()
  const user = await getCurrentUser()
  if (!user) {
    return notFound()
  }

  const domain = await getDomainFromHeader()
  const organization = await organizationService.findByDomain(domain)

  const searchParams = await props.searchParams
  const search = listOrganizationMembersSearchParamsCache.parse(searchParams)

  const [{ data: members }, workspaces] = await Promise.all([
    listOrganizationMembers({
      ...search,
      organizationId: organization.id,
    }),
    listOrgWorkspaces({ organizationId: organization.id }),
  ])

  const workspaceOptions = workspaces.map((w) => ({ id: w.id, name: w.name }))

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-semibold text-foreground text-xl">
          {t("organizationUsers.pageTitle")}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          {t("organizationUsers.pageSubtitle")}
        </p>
      </div>

      <OrganizationMembersList
        currentUserId={user.id}
        initialKeyword={search.keyword ?? ""}
        members={members}
        workspaceOptions={workspaceOptions}
      />
    </div>
  )
}
