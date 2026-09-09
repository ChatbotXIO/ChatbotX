import { flowAnalyticsService } from "@chatbotx.io/analytics"
import { flowService } from "@chatbotx.io/business"
import { smartDelayService } from "@chatbotx.io/business/smart-delay"
import type { FlowNode } from "@chatbotx.io/flow-config"
import { notFound } from "next/navigation"
import type { FlowVersionResource } from "@/features/flow-versions/schema/resource"
import { buildSmartDelayNodeStats } from "@/features/flows/analytics/smart-delay-node-stats"
import { FlowAnalytics } from "@/features/flows/flow-analytics"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import { FlowTemplateStoreProvider } from "@/features/flows/react-flow/stores/flow-template-store-provider"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"
import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission"

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

  await requireWorkspacePermission(data.workspaceId, "flows")

  let flow: Awaited<ReturnType<typeof flowService.findById>>
  try {
    flow = await flowService.findById({
      id: data.id,
      workspaceId: data.workspaceId,
    })
  } catch {
    return notFound()
  }

  const draftFlowVersion = flow.flowVersions?.find((v) => v.isDraft)
  if (!draftFlowVersion) {
    return notFound()
  }

  const [stats, smartDelayRows] = await Promise.all([
    flowAnalyticsService.getFlowStats({
      workspaceId: data.workspaceId,
      flowId: data.id,
    }),
    smartDelayService.countByFlowStep({
      workspaceId: data.workspaceId,
      flowId: data.id,
    }),
  ])
  const smartDelayStats = buildSmartDelayNodeStats(
    draftFlowVersion.nodes as unknown as FlowNode[],
    smartDelayRows,
  )

  return (
    <div className="flex h-screen w-screen flex-col">
      <FlowStoreProvider workspaceId={data.workspaceId}>
        <FlowTemplateStoreProvider workspaceId={data.workspaceId}>
          <FlowAnalytics
            flow={flow}
            flowVersion={draftFlowVersion as FlowVersionResource}
            smartDelayStats={smartDelayStats}
            stats={stats}
          />
        </FlowTemplateStoreProvider>
      </FlowStoreProvider>
    </div>
  )
}
