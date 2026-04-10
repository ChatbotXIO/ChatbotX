import type { FlowNodeStatsResponse } from "@chatbotx.io/analytics"
import ky from "ky"
import { useEffect, useState } from "react"
import type { FlowResource } from "../../schemas/resource"

type GetFlowLinkProps = {
  flow: FlowResource
  isDraft?: boolean
}
export default function AnalyticsFlow({ flow }: GetFlowLinkProps) {
  const [_stats, setStats] = useState<FlowNodeStatsResponse | null>(null)

  useEffect(() => {
    const fetchStats = async () => {
      const stats = await ky
        .get(`/api/workspaces/${flow.workspaceId}/flows/${flow.id}/stats`)
        .json<FlowNodeStatsResponse>()

      setStats(stats)
    }

    fetchStats()
  }, [flow.workspaceId, flow.id])

  return <div />
}
