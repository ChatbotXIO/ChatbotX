"use client"

import type { FlowNode, NodeType } from "@aha.chat/flow-config"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@aha.chat/ui/components/ui/sheet"
import { type ReactFlowState, useStore } from "@xyflow/react"
import { memo } from "react"
import { NodeEditor } from "./editor"
import { NodeNameEditor } from "./node-name-editor"

type NodeDetailSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

// Select only the selected node from the store
const selectSelectedNode = (state: ReactFlowState): FlowNode | null =>
  (state.nodes.find((node) => node.selected) as FlowNode) || null

// Custom equality function that compares node ID and data reference
// This prevents re-renders from position/dragging changes but allows data updates
const equalityFn = (a: FlowNode | null, b: FlowNode | null): boolean => {
  if (a === b) {
    return true
  }
  if (!a) {
    return false
  }
  if (!b) {
    return false
  }

  // Compare ID and data reference (data reference changes when updateNodeData is called)
  return a.id === b.id && a.data === b.data
}

export function NodeDetailSheet({ open, onOpenChange }: NodeDetailSheetProps) {
  // Use store selector with custom equality function
  const activeNode = useStore(selectSelectedNode, equalityFn)

  return open && activeNode ? (
    <NodeDetailSheetContent
      activeNode={activeNode}
      onOpenChange={onOpenChange}
      open={open}
    />
  ) : null
}

export const NodeDetailSheetContent = memo(
  ({
    activeNode,
    open,
    onOpenChange,
  }: {
    activeNode: FlowNode
    open: boolean
    onOpenChange: (open: boolean) => void
  }) => (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="flex flex-col gap-0" side="left">
        <SheetTitle>
          <NodeNameEditor activeNode={activeNode} />
        </SheetTitle>
        <SheetDescription />
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
          <NodeEditor
            nodeDetails={activeNode.data.details}
            nodeId={activeNode.id}
            nodeType={activeNode.type as NodeType}
          />
        </div>
      </SheetContent>
    </Sheet>
  ),
)
