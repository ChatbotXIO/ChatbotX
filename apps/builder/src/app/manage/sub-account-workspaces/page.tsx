import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { SubAccountWorkspacesTable } from "@/features/reseller-workspaces/components/sub-account-workspaces-table"
import { listSubAccountWorkspaces } from "@/features/reseller-workspaces/queries/list-sub-account-workspaces"
import { getSubAccountWorkspacesSearchParamsCache } from "@/features/reseller-workspaces/schema/query"

export default async function SubAccountWorkspacesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const [t, search] = await Promise.all([
    getTranslations("resellerWorkspaces"),
    getSubAccountWorkspacesSearchParamsCache.parse(await searchParams),
  ])

  const promises = Promise.all([listSubAccountWorkspaces(search)])

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="font-bold text-lg sm:text-xl">{t("title")}</h3>
        <p className="text-muted-foreground text-sm">{t("description")}</p>
      </div>

      <Suspense>
        <SubAccountWorkspacesTable promises={promises} />
      </Suspense>
    </div>
  )
}
