import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { QuestionnaireApplicantsTable } from "@/features/questionnaires/components/questionnaire-applicants-table"
import { QuestionnaireDashboardSummary } from "@/features/questionnaires/components/questionnaire-dashboard-summary"
import {
  getQuestionnaire,
  getQuestionnaireDashboardSummary,
  listQuestionnaireSubmissions,
} from "@/features/questionnaires/queries"
import { listQuestionnaireSubmissionsSearchParamsCache } from "@/features/questionnaires/schemas/query"

export default async function QuestionnaireApplicantsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspaceId: string; id: string }>
  searchParams: Promise<SearchParams>
}) {
  const resolvedParams = await params
  const workspaceId = getIdFromParams(resolvedParams, "workspaceId")
  const id = getIdFromParams(resolvedParams, "id")
  if (!(workspaceId && id)) {
    return notFound()
  }
  const [t, questionnaire, search] = await Promise.all([
    getTranslations(),
    getQuestionnaire({ workspaceId, id }),
    listQuestionnaireSubmissionsSearchParamsCache.parse(await searchParams),
  ])
  const tablePromises = Promise.all([
    listQuestionnaireSubmissions({
      ...search,
      workspaceId,
      questionnaireId: id,
    }),
  ])
  const summaryPromise = getQuestionnaireDashboardSummary({
    workspaceId,
    questionnaireId: id,
  })
  return (
    <div className="flex flex-col gap-4">
      <AppBreadcrumb
        items={[
          { label: t("tools.title"), href: `/space/${workspaceId}/tools` },
          {
            label: t("questionnaires.title"),
            href: `/space/${workspaceId}/questionnaires`,
          },
          {
            label: questionnaire.name,
            href: `/space/${workspaceId}/questionnaires/${id}/edit`,
          },
          { label: t("questionnaires.applicants"), href: "" },
        ]}
      />
      <Suspense fallback={<div>{t("actions.loading")}</div>}>
        <QuestionnaireDashboardSummary summary={summaryPromise} />
      </Suspense>
      <Suspense fallback={<div>{t("actions.loading")}</div>}>
        <QuestionnaireApplicantsTable
          promises={tablePromises}
          questionnaireId={id}
          workspaceId={workspaceId}
        />
      </Suspense>
    </div>
  )
}
