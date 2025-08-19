"use client"

import { ReactFlowProvider } from "@xyflow/react"
import { ReactFlowFrame } from "./react-flow/frame"
import { StepStoreProvider } from "./react-flow/stores/step-store-provider"
import type { FlowVersionResource } from "./schemas/get-flows-schema"

type FlowDetailProps = {
  flowVersion: FlowVersionResource
}

export function FlowDetail({ flowVersion }: FlowDetailProps) {
  return (
    <ReactFlowProvider>
      <StepStoreProvider>
        <ReactFlowFrame flowVersion={flowVersion} />
      </StepStoreProvider>
    </ReactFlowProvider>
  )
}
