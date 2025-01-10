"use client"

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Node } from "@xyflow/react"
import dynamic from "next/dynamic"
import { PanelAction } from "../types"

const AddNotesEditor = dynamic(() => import('@/features/flows/react-flow/nodes/add-notes/add-notes-editor'));
const SendMessageNodeEditor = dynamic(() => import('@/features/flows/react-flow/nodes/send-message/editor'));
const SplitTrafficNodeEditor = dynamic(() => import('@/features/flows/react-flow/nodes/split-traffic/editor'));

const getEditor = (activeNode: Node<any>) => {
  return {
    [PanelAction.AddNotes]: <AddNotesEditor />,
    [PanelAction.SendMessage]: <SendMessageNodeEditor activeNode={activeNode} />,
    [PanelAction.SplitTraffic]: <SplitTrafficNodeEditor activeNode={activeNode} />
  }[activeNode.type ?? '']
}

export function NodeDetailSheet({ open, onOpenChange, activeNode }: { open: boolean, onOpenChange: (open: boolean) => void, activeNode?: Node<any> | null }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="flex flex-col">
        <SheetHeader>
          <SheetTitle>
            {activeNode ? activeNode.data.icon : null}
            {activeNode ? activeNode.data.name : "\u00A0"}
          </SheetTitle>
          <SheetDescription />
        </SheetHeader>
        <div className="flex flex-col flex-1 gap-4 overflow-hidden">
          {
            activeNode && activeNode.type && getEditor(activeNode)
          }
        </div>
      </SheetContent>
    </Sheet>
  )
}
