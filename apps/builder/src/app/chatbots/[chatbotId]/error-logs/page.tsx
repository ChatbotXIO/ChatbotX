import { LogType } from "@aha.chat/database"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { AppTab } from "@/components/app-tab"
import { ErrorLogsTable } from "@/features/logs/error-logs-table"
import { getLogs } from "@/features/logs/queries"
import { getLogsSearchParamsCache } from "@/features/logs/schemas/get-logs-schema"

export default async function ErrorLogsPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const t = await getTranslations()

  const params = await props.params
  const searchParams = await props.searchParams
  const search = getLogsSearchParamsCache.parse(searchParams)

  const promises = Promise.all([
    getLogs({
      ...search,
      chatbotId: params.chatbotId,
      logType: LogType.error,
    }),
  ])

  return (
    <div className="flex flex-col gap-4">
      <AppBreadcrumb
        items={[
          {
            label: t("fields.flows.label"),
            href: `/chatbots/${params.chatbotId}/flows`,
          },
          { label: t("errorLog.heading.title"), href: "" },
        ]}
      />
      <AppTab chatbotId={params.chatbotId} />
      <Suspense>
        <ErrorLogsTable chatbotId={params.chatbotId} promises={promises} />
      </Suspense>
    </div>
  )
}
