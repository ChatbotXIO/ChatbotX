"use client"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { DynamicIcon } from "lucide-react/dynamic"
import { allNodesConfig } from "../nodes/node-config"
import { useFlowStore } from "../stores/flow-store-provider"

interface NodeDetailSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NodeDetailSheet({ open, onOpenChange }: NodeDetailSheetProps) {
  const activeNode = useFlowStore((state) => state.activeNode)
  const nodeConfig = allNodesConfig.find(
    (item) => item.type === activeNode?.type,
  )

  return activeNode ? (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="flex flex-col">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {nodeConfig ? <DynamicIcon name={nodeConfig.icon} /> : " "}
            {activeNode.data.name}
          </SheetTitle>
          <SheetDescription />
        </SheetHeader>
        <div className="flex flex-col flex-1 gap-4 overflow-hidden">
          {nodeConfig?.editor ? (
            <nodeConfig.editor activeNode={activeNode} />
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  ) : null
}
