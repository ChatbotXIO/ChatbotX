import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { PlatformAdminsTable } from "@/enterprise/features/platform-admins/platform-admins-table"
import { listPlatformAdmins } from "@/enterprise/features/platform-admins/queries"
import { getPlatformAdminsSearchParamsCache } from "@/enterprise/features/platform-admins/query"

export default async function PlatformAdminsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const [t, search] = await Promise.all([
    getTranslations(),
    getPlatformAdminsSearchParamsCache.parse(await searchParams),
  ])
  const admins = await listPlatformAdmins(search.page)

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="font-bold text-lg sm:text-xl">
          {t("platformAdmin.admins.title")}
        </h3>
        <p className="text-muted-foreground text-sm">
          {t("platformAdmin.admins.description")}
        </p>
      </div>

      <Suspense>
        <PlatformAdminsTable
          page={search.page}
          promises={Promise.resolve([admins])}
        />
      </Suspense>
    </div>
  )
}
