import { db } from "@chatbotx.io/database/client"
import { notFound } from "next/navigation"
import type { FlowVersionResource } from "@/features/flow-versions/schema/resource"
import { FlowDetail } from "@/features/flows/flow-detail"
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

  return (
    <div className="flex h-screen w-screen flex-col">
      <FlowDetail
        flow={flow}
        flowVersion={draftFlowVersion as FlowVersionResource}
      />
    </div>
  )
}
