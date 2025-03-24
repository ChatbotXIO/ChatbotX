"use client"

import { Sheet, SheetContent, SheetDescription } from "@/components/ui/sheet"
import { useStore } from "@xyflow/react"
import { NodeEditor } from "./editor"
import type { FlowNode } from "../types"

interface NodeDetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NodeDetailSheet({ open, onOpenChange }: NodeDetailSheetProps) {
  const activeNode = useStore((state) =>
    state.nodes.find((node) => node.selected),
  ) as FlowNode

  return activeNode ? (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="flex flex-col">
        <SheetDescription />
        <div className="flex flex-col flex-1 gap-4 overflow-hidden">
          <NodeEditor activeNode={activeNode} />
        </div>
      </SheetContent>
    </Sheet>
  ) : null
}
