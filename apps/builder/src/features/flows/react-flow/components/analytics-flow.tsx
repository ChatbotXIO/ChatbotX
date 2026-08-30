import type { FlowNodeStatsResponse } from "@chatbotx.io/analytics"
import { useEffect, useState } from "react"
import { client } from "@/lib/orpc/orpc"
import type { FlowResource } from "../../schema/resource"

type GetFlowLinkProps = {
  flow: FlowResource
  isDraft?: boolean
}
export default function AnalyticsFlow({ flow }: GetFlowLinkProps) {
  const [_stats, setStats] = useState<FlowNodeStatsResponse | null>(null)

  useEffect(() => {
    const fetchStats = async () => {
      const stats = await client.flowsAPI.privateGetFlowStatsAPI({
        workspaceId: flow.workspaceId,
        flowId: flow.id,
      })

      setStats(stats as FlowNodeStatsResponse)
    }

    fetchStats()
  }, [flow.workspaceId, flow.id])

  return <div />
}
