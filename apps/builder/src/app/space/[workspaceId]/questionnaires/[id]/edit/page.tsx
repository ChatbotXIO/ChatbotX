import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import { EditQuestionnaireForm } from "@/features/questionnaires/components/edit-questionnaire-form"
import { getQuestionnaire } from "@/features/questionnaires/queries"

export default async function EditQuestionnairePage({
  params,
}: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const resolvedParams = await params
  const workspaceId = getIdFromParams(resolvedParams, "workspaceId")
  const id = getIdFromParams(resolvedParams, "id")
  if (!(workspaceId && id)) {
    return notFound()
  }
  const [t, questionnaire] = await Promise.all([
    getTranslations(),
    getQuestionnaire({ workspaceId, id }),
  ])
  return (
    <div className="flex flex-col gap-4">
      <AppBreadcrumb
        items={[
          { label: t("tools.title"), href: `/space/${workspaceId}/tools` },
          {
            label: t("questionnaires.title"),
            href: `/space/${workspaceId}/questionnaires`,
          },
          { label: questionnaire.name, href: "" },
        ]}
      />
      <FlowStoreProvider workspaceId={workspaceId}>
        <CustomFieldStoreProvider workspaceId={workspaceId}>
          <EditQuestionnaireForm
            questionnaire={questionnaire}
            workspaceId={workspaceId}
          />
        </CustomFieldStoreProvider>
      </FlowStoreProvider>
    </div>
  )
}
