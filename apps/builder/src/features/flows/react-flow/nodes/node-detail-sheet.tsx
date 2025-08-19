"use client"

import type { FlowNode } from "@aha.chat/flow-config"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@aha.chat/ui/components/ui/sheet"
import { useStore } from "@xyflow/react"
import { NodeEditor } from "./editor"

type NodeDetailSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NodeDetailSheet({ open, onOpenChange }: NodeDetailSheetProps) {
  const activeNode = useStore((state) =>
    state.nodes.find((node) => node.selected),
  ) as FlowNode

  return activeNode ? (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="flex flex-col" side="left">
        <SheetTitle />
        <SheetDescription />
        <div className="flex flex-1 flex-col gap-4 overflow-hidden p-5">
          <NodeEditor activeNode={activeNode} />
        </div>
      </SheetContent>
    </Sheet>
  ) : null
}
