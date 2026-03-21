import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import OrganizationMembersTable from "@/enterprise/features/organization-members/organization-members-table"
import { listOrganizationMembersRSC } from "@/enterprise/features/organization-members/queries"
import { listOrganizationMembersSearchParamsCache } from "@/enterprise/features/organization-members/schema"

type ManageUsersPageProps = {
  searchParams: Promise<SearchParams>
}

export default async function ManageUsersPage(props: ManageUsersPageProps) {
  const t = await getTranslations()

  const searchParams = await props.searchParams
  const search = listOrganizationMembersSearchParamsCache.parse(searchParams)
  const promises = Promise.all([listOrganizationMembersRSC(search)])

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-lg sm:text-xl">{t("users.title")}</h3>

      <Suspense>
        <OrganizationMembersTable promises={promises} />
      </Suspense>
    </div>
  )
}
