import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { PipelineBoard } from "@/features/pipelines/components/board/pipeline-board"
import { canViewPipeline } from "@/features/pipelines/queries/can-view-pipeline.query"
import { LockedIdsProvider } from "@/features/templates/components/lock-badge"

export default async function PipelineBoardPage({
  params,
}: {
  params: Promise<{ workspaceId: string; id: string }>
}) {
  const resolved = await params
  const workspaceId = getIdFromParams(resolved, "workspaceId")
  const pipelineId = getIdFromParams(resolved, "id")
  if (!(workspaceId && pipelineId)) {
    return notFound()
  }

  if (!(await canViewPipeline({ workspaceId, pipelineId }))) {
    return notFound()
  }

  const t = await getTranslations()

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <AppBreadcrumb
        items={[
          {
            label: t("fields.pipelines.label"),
            href: `/space/${workspaceId}/pipelines`,
          },
          { label: t("pipelines.board.title"), href: "" },
        ]}
      />
      <LockedIdsProvider
        resourceIds={[pipelineId]}
        resourceKind="pipeline"
        workspaceId={workspaceId}
      >
        <PipelineBoard pipelineId={pipelineId} workspaceId={workspaceId} />
      </LockedIdsProvider>
    </div>
  )
}
