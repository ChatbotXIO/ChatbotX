import { flowService, listLockedIds } from "@chatbotx.io/business"
import { notFound } from "next/navigation"
import { FlowDetail } from "@/features/flows/flow-detail"
import { isSameContent } from "@/features/flows/flow-version-content"
import { listIntegrationOpenaiCompatible } from "@/features/integration-openai-compatible/queries"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"
import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission"
import { isNotFoundException } from "@/lib/errors/validation-exception"

type FlowPageProps = {
  params: Promise<{ workspaceId: string; id: string }>
}

export default async function FlowPage({ params }: FlowPageProps) {
  const { data } = await withWorkspaceIdAndIdSchema.safeParse(await params)
  if (!data) {
    return notFound()
  }

  await requireWorkspacePermission(data.workspaceId, "flows")

  let flow: Awaited<ReturnType<typeof flowService.findById>>
  try {
    flow = await flowService.findById({
      id: data.id,
      workspaceId: data.workspaceId,
    })
  } catch (error) {
    if (isNotFoundException(error)) {
      return notFound()
    }
    throw error
  }

  const draftFlowVersion = flow.flowVersions?.find((v) => v.isDraft)
  if (!draftFlowVersion) {
    return notFound()
  }

  // A copy installed from a View-only template opens read-only. The write
  // paths refuse independently, so this only spares the editor a failed save.
  const [openaiCompatibleIntegrations, lockedFlowIds] = await Promise.all([
    listIntegrationOpenaiCompatible({ workspaceId: data.workspaceId }),
    listLockedIds({
      workspaceId: data.workspaceId,
      resourceKind: "flow",
      resourceIds: [flow.id],
    }),
  ])
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
        isTemplateLocked={lockedFlowIds.length > 0}
        openaiCompatibleIntegrations={openaiCompatibleIntegrations}
      />
    </div>
  )
}
