import { flowAnalyticsService } from "@chatbotx.io/analytics"
import { db } from "@chatbotx.io/database/client"
import { notFound } from "next/navigation"
import type { FlowVersionResource } from "@/features/flow-versions/schema/resource"
import { FlowAnalytics } from "@/features/flows/flow-analytics"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"

type FlowAnalyticsPageProps = {
  params: Promise<{ workspaceId: string; id: string }>
}

export default async function FlowAnalyticsPage({
  params,
}: FlowAnalyticsPageProps) {
  const { data } = await withWorkspaceIdAndIdSchema.safeParse(await params)
  if (!data) {
    return notFound()
  }

  const userAndWorkspace = await getCurrentUserAndTargetWorkspace(
    data.workspaceId,
  )
  if (!userAndWorkspace) {
    return notFound()
  }

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

  const stats = await flowAnalyticsService.getFlowStats({
    workspaceId: data.workspaceId,
    flowId: data.id,
  })

  return (
    <div className="flex h-screen w-screen flex-col">
      <FlowAnalytics
        flow={flow}
        flowVersion={draftFlowVersion as FlowVersionResource}
        stats={stats}
      />
    </div>
  )
}
