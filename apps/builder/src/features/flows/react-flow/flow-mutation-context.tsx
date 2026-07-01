import type { FlowNode } from "@chatbotx.io/flow-config"
import { createContext, useContext } from "react"

export type FlowMutationContextValue = {
  isFlowMutating: boolean
  duplicateNode: (sourceNode: FlowNode) => Promise<void>
  deleteNode: (nodeId: string) => Promise<void>
}

const FlowMutationContext = createContext<FlowMutationContextValue | null>(null)

export const FlowMutationProvider = FlowMutationContext.Provider

export function useFlowMutation(): FlowMutationContextValue {
  const ctx = useContext(FlowMutationContext)
  if (!ctx) {
    throw new Error(
      "useFlowMutation must be used within a FlowMutationProvider",
    )
  }
  return ctx
}
