"use client"

import type { FlowNodeStatsResponse } from "@chatbotx.io/analytics/schemas"
import { ReactFlowProvider } from "@xyflow/react"
import type { FlowVersionResource } from "../flow-versions/schema/resource"
import { FlowAnalyticsFrame } from "./react-flow/flow-analytics-frame"
import { StepStoreProvider } from "./react-flow/stores/step-store-provider"
import type { FlowResource } from "./schemas/resource"

type FlowAnalyticsProps = {
  flow: FlowResource
  flowVersion: FlowVersionResource
  stats: FlowNodeStatsResponse
}

export function FlowAnalytics({
  flow,
  flowVersion,
  stats,
}: FlowAnalyticsProps) {
  return (
    <ReactFlowProvider>
      <StepStoreProvider>
        <FlowAnalyticsFrame
          flow={flow}
          flowVersion={flowVersion}
          stats={stats}
        />
      </StepStoreProvider>
    </ReactFlowProvider>
  )
}
