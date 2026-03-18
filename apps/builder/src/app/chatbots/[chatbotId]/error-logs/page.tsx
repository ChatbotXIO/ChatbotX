import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { AppTab } from "@/components/app-tab"
import { ErrorLogsTable } from "@/features/error-logs/error-logs-table"
import { listErrorLogs } from "@/features/error-logs/queries"
import { listErrorLogsSearchParamsCache } from "@/features/error-logs/schemas/query"

export default async function ErrorLogsPage(props: {
  params: Promise<{ chatbotId: string }>
  searchParams: Promise<SearchParams>
}) {
  const t = await getTranslations()

  const params = await props.params
  const searchParams = await props.searchParams
  const search = listErrorLogsSearchParamsCache.parse(searchParams)

  const promises = Promise.all([
    listErrorLogs({
      ...search,
      chatbotId: params.chatbotId,
    }),
  ])

  return (
    <div className="flex flex-col gap-4">
      <AppTab
        tabs={[
          {
            label: t("flows.title"),
            href: `/chatbots/${params.chatbotId}/flows`,
            isActive: false,
          },
          {
            label: t("tags.title"),
            href: `/chatbots/${params.chatbotId}/tags`,
            isActive: false,
          },
          {
            label: t("customFields.title"),
            href: `/chatbots/${params.chatbotId}/custom-fields`,
            isActive: false,
          },
          {
            label: t("errorLogs.title"),
            href: `/chatbots/${params.chatbotId}/error-logs`,
            isActive: true,
          },
        ]}
      />
      <Suspense>
        <ErrorLogsTable chatbotId={params.chatbotId} promises={promises} />
      </Suspense>
    </div>
  )
}
