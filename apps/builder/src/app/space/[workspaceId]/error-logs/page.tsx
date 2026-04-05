import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { AppTab } from "@/components/app-tab"
import { ErrorLogsTable } from "@/features/error-logs/error-logs-table"
import { listErrorLogs } from "@/features/error-logs/queries"
import { listErrorLogsSearchParamsCache } from "@/features/error-logs/schemas/query"

export default async function ErrorLogsPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const t = await getTranslations()

  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const searchParams = await props.searchParams
  const search = listErrorLogsSearchParamsCache.parse(searchParams)

  const promises = Promise.all([
    listErrorLogs({
      ...search,
      workspaceId,
    }),
  ])

  return (
    <div className="flex flex-col gap-4">
      <AppTab
        tabs={[
          {
            label: t("flows.title"),
            href: `/space/${workspaceId}/flows`,
            isActive: false,
          },
          {
            label: t("tags.title"),
            href: `/space/${workspaceId}/tags`,
            isActive: false,
          },
          {
            label: t("customFields.title"),
            href: `/space/${workspaceId}/custom-fields`,
            isActive: false,
          },
          {
            label: t("errorLogs.title"),
            href: `/space/${workspaceId}/error-logs`,
            isActive: true,
          },
        ]}
      />
      <Suspense>
        <ErrorLogsTable promises={promises} workspaceId={workspaceId} />
      </Suspense>
    </div>
  )
}
