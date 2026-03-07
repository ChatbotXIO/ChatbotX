import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import OrganizationMembersTable from "@/enterprise/features/organization-members/organization-members-table"
import { listOrganizationMembersRSC } from "@/enterprise/features/organization-members/queries"
import { listOrganizationMembersSearchParamsCache } from "@/enterprise/features/organization-members/schema/query"

type ManageUsersPageProps = {
  searchParams: Promise<SearchParams>
}

export default async function ManageUsersPage(props: ManageUsersPageProps) {
  const searchParams = await props.searchParams
  const search = listOrganizationMembersSearchParamsCache.parse(searchParams)
  const promises = Promise.all([listOrganizationMembersRSC(search)])

  return (
    <Suspense>
      <OrganizationMembersTable promises={promises} />
    </Suspense>
  )
}
