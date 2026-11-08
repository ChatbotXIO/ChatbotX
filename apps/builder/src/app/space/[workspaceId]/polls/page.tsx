import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { PollsTable } from "@/features/polls/components/polls-table"
import { listPolls } from "@/features/polls/queries"
import { listPollsSearchParamsCache } from "@/features/polls/schema/query"

export default async function PollsPage({
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
  const search = listPollsSearchParamsCache.parse(await searchParams)
  const promises = Promise.all([listPolls({ ...search, workspaceId })])

  return (
    <div className="flex flex-col gap-4">
      <AppBreadcrumb
        items={[
          { label: t("tools.title"), href: `/space/${workspaceId}/tools` },
          { label: t("pollManager.title"), href: "" },
        ]}
      />
      <Suspense fallback={<div>{t("actions.loading")}</div>}>
        <PollsTable promises={promises} workspaceId={workspaceId} />
      </Suspense>
    </div>
  )
}
