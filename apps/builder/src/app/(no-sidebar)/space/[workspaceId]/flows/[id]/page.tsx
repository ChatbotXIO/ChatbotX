import { db } from "@chatbotx.io/database/client"
import { notFound } from "next/navigation"
import { FlowDetail } from "@/features/flows/flow-detail"
import { isSameContent } from "@/features/flows/flow-version-content"
import { listIntegrationOpenaiCompatible } from "@/features/integration-openai-compatible/queries"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"
import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission"

type FlowPageProps = {
  params: Promise<{ workspaceId: string; id: string }>
}

export default async function FlowPage({ params }: FlowPageProps) {
  const { data } = await withWorkspaceIdAndIdSchema.safeParse(await params)
  if (!data) {
    return notFound()
  }

  await requireWorkspacePermission(data.workspaceId, "flows")

  const flow = await db.query.flowModel.findFirst({
    where: {
      id: data.id,
      workspaceId: data.workspaceId,
    },
    with: {
      flowVersions: true,
    },
  })
  if (!flow) {
    return notFound()
  }

  const draftFlowVersion = flow.flowVersions?.find((v) => v.isDraft)
  if (!draftFlowVersion) {
    return notFound()
  }

  const openaiCompatibleIntegrations = await listIntegrationOpenaiCompatible({
    workspaceId: data.workspaceId,
  })
  const publishedVersion = flow.flowVersions?.find(
    (v) => v.isLatest && !v.isDraft,
  )
  const hasPublishedVersion = publishedVersion !== undefined
  const canRevertToPublished =
    hasPublishedVersion &&
    !isSameContent(
      draftFlowVersion.nodes,
      draftFlowVersion.edges,
      publishedVersion.nodes,
      publishedVersion.edges,
    )

  return (
    <div className="flex h-screen w-screen flex-col">
      <FlowDetail
        canRevertToPublished={canRevertToPublished}
        flow={flow}
        flowVersion={draftFlowVersion}
        hasPublishedVersion={hasPublishedVersion}
        openaiCompatibleIntegrations={openaiCompatibleIntegrations}
      />
    </div>
  )
}
