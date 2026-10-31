import type { FlowNode } from "@chatbotx.io/flow-config"
import { createContext, useContext } from "react"

export type FlowMutationContextValue = {
  isFlowMutating: boolean
  /** A flow installed from a view-only template: the canvas shows it but must not edit it. */
  isReadOnly: boolean
  duplicateNode: (sourceNode: FlowNode) => Promise<void>
  deleteNode: (nodeId: string) => Promise<void>
}

const FlowMutationContext = createContext<FlowMutationContextValue | null>(null)

export const FlowMutationProvider = FlowMutationContext.Provider

/**
 * Whether the canvas around the caller must not edit the flow. Outside a
 * provider (the analytics viewer) nothing is editable, so it reads as true.
 */
export function useIsFlowReadOnly(): boolean {
  return useContext(FlowMutationContext)?.isReadOnly ?? true
}

export function useFlowMutation(): FlowMutationContextValue {
  const ctx = useContext(FlowMutationContext)
  if (!ctx) {
    throw new Error(
      "useFlowMutation must be used within a FlowMutationProvider",
    )
  }
  return ctx
}
