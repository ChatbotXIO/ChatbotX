"use client"

import type { FlowNodeStatsResponse } from "@chatbotx.io/analytics/schemas"
import { ReactFlowProvider } from "@xyflow/react"
import { CustomFieldStoreProvider } from "../custom-fields/provider/custom-field-store-context"
import type { FlowVersionResource } from "../flow-versions/schema/resource"
import type { SmartDelayNodeStats } from "./analytics/smart-delay-node-stats"
import { FlowAnalyticsFrame } from "./react-flow/flow-analytics-frame"
import { StepStoreProvider } from "./react-flow/stores/step-store-provider"
import type { FlowResource } from "./schemas/resource"

type FlowAnalyticsProps = {
  flow: FlowResource
  flowVersion: FlowVersionResource
  smartDelayStats: Record<string, SmartDelayNodeStats>
  stats: FlowNodeStatsResponse
}

export function FlowAnalytics({
  flow,
  flowVersion,
  smartDelayStats,
  stats,
}: FlowAnalyticsProps) {
  return (
    <ReactFlowProvider>
      <StepStoreProvider>
        {/* Step viewers rendered in the analytics canvas read the custom-field
            store (e.g. WaitStepViewer resolves dynamic-date field names). */}
        <CustomFieldStoreProvider workspaceId={flow.workspaceId}>
          <FlowAnalyticsFrame
            flow={flow}
            flowVersion={flowVersion}
            smartDelayStats={smartDelayStats}
            stats={stats}
          />
        </CustomFieldStoreProvider>
      </StepStoreProvider>
    </ReactFlowProvider>
  )
}
