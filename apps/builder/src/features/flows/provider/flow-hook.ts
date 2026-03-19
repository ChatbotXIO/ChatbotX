import type { FlowNode } from "@aha.chat/flow-config"
import { useMemo } from "react"
import type { FlowVersionResource } from "@/features/flow-versions/schema/resource"
import { useFlowStore } from "./flow-store-context"

export const useFlowSelectOptions = () => {
  const { flows } = useFlowStore((state) => state)

  return useMemo(
    () =>
      flows.map((flow) => ({
        label: flow.name,
        value: flow.id,
      })),
    [flows],
  )
}

export const useFlowNodesSelectOptions = () => {
  const { flows } = useFlowStore((state) => state)

  return useMemo(
    () =>
      flows.map((flow) => ({
        label: flow.name,
        value: flow.id,
        children: getFlowNodesOptions(flow.flowVersions),
      })),
    [flows],
  )
}

const getFlowNodesOptions = (flowVersions: FlowVersionResource[]) => {
  const lastedFlowVersion = flowVersions.find(({ isLatest }) => isLatest)
  if (!lastedFlowVersion) {
    return []
  }

  return (lastedFlowVersion.nodes as FlowNode[]).map((node: FlowNode) => ({
    label: node.data.name,
    value: node.id,
  }))
}
