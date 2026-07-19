import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { QuestionnairesTable } from "@/features/questionnaires/components/questionnaires-table"
import { listQuestionnaires } from "@/features/questionnaires/queries"
import { listQuestionnairesSearchParamsCache } from "@/features/questionnaires/schemas/query"

export default async function QuestionnairesPage({
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
  const [t, search] = await Promise.all([
    getTranslations(),
    listQuestionnairesSearchParamsCache.parse(await searchParams),
  ])
  const promises = Promise.all([listQuestionnaires({ ...search, workspaceId })])
  return (
    <div className="flex flex-col gap-4">
      <AppBreadcrumb
        items={[
          { label: t("tools.title"), href: `/space/${workspaceId}/tools` },
          { label: t("questionnaires.title"), href: "" },
        ]}
      />
      <Suspense fallback={<div>{t("actions.loading")}</div>}>
        <QuestionnairesTable promises={promises} workspaceId={workspaceId} />
      </Suspense>
    </div>
  )
}
