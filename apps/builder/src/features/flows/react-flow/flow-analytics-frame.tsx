"use client"

import "@xyflow/react/dist/style.css"
import type { FlowNodeStatsResponse } from "@chatbotx.io/analytics/schemas"
import type { FlowVersionResource } from "@/features/flow-versions/schema/resource"
import type { FlowResource } from "../schemas/resource"
import { FlowAnalyticsHeader } from "./flow-analytics-header"
import { ReactFlowAnalyticsWrapper } from "./react-flow-analysis-wrapper"

type FlowAnalyticsFrameProps = {
  flow: FlowResource
  flowVersion: FlowVersionResource
  stats: FlowNodeStatsResponse
}

export function FlowAnalyticsFrame({
  flow,
  flowVersion,
  stats,
}: FlowAnalyticsFrameProps) {
  return (
    <>
      <FlowAnalyticsHeader flow={flow} />
      <ReactFlowAnalyticsWrapper flowVersion={flowVersion} stats={stats} />
    </>
  )
}
