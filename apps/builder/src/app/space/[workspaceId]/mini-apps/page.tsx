import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { MiniAppsTable } from "@/features/mini-apps/mini-apps-table"
import {
  listMiniApps,
  listWhatsappPublishTargets,
} from "@/features/mini-apps/queries"
import { listMiniAppsSearchParamsCache } from "@/features/mini-apps/schema/query"

export default async function MiniAppsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }
  const t = await getTranslations()
  const search = listMiniAppsSearchParamsCache.parse(await searchParams)
  const promises = Promise.all([
    listMiniApps({ ...search, workspaceId }),
    listWhatsappPublishTargets(workspaceId),
  ])

  return (
    <div className="flex flex-col gap-4">
      <AppBreadcrumb
        items={[
          { label: t("tools.title"), href: `/space/${workspaceId}/tools` },
          { label: t("miniApps.title"), href: "" },
        ]}
      />
      <Suspense>
        <MiniAppsTable promises={promises} workspaceId={workspaceId} />
      </Suspense>
    </div>
  )
}
