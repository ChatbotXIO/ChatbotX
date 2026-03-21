import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import PlansTable from "@/enterprise/features/plans/plans-table"
import { listPlansRSC } from "@/enterprise/features/plans/queries"
import { listPlansSearchParamsCache } from "@/enterprise/features/plans/schemas/query"

type ManagePlansPageProps = {
  searchParams: Promise<SearchParams>
}

export default async function ManagePlansPage(props: ManagePlansPageProps) {
  const t = await getTranslations()

  const searchParams = await props.searchParams
  const search = listPlansSearchParamsCache.parse(searchParams)
  const promises = Promise.all([listPlansRSC(search)])

  return (
    <div className="space-y-4">
      <h3 className="font-bold text-lg sm:text-xl">{t("plans.title")}</h3>

      <Suspense>
        <PlansTable promises={promises} />
      </Suspense>
    </div>
  )
}
