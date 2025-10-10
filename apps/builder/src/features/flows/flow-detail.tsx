"use client"

import { ReactFlowProvider } from "@xyflow/react"
import { use } from "react"
import type { listCustomFields } from "../custom-fields/queries"
import type { getFlows } from "./queries"
import { ReactFlowFrame } from "./react-flow/frame"
import { StepStoreProvider } from "./react-flow/stores/step-store-provider"
import type { FlowVersionResource } from "./schemas/get-flows-schema"

type FlowDetailProps = {
  flowVersion: FlowVersionResource
  promises: Promise<
    [
      Awaited<ReturnType<typeof listCustomFields>>,
      Awaited<ReturnType<typeof getFlows>>,
    ]
  >
}

export function FlowDetail({ flowVersion, promises }: FlowDetailProps) {
  const [{ data: customFields }] = use(promises)

  return (
    <ReactFlowProvider>
      <StepStoreProvider initialState={{ customFields, flows: [] }}>
        <ReactFlowFrame flowVersion={flowVersion} />
      </StepStoreProvider>
    </ReactFlowProvider>
  )
}
