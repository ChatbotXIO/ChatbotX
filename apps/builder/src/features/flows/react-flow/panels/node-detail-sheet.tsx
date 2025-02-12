"use client"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import type { Node } from "@xyflow/react"
import dynamic from "next/dynamic"
import { PanelAction } from "../types"

const AddNotesEditor = dynamic(
  () => import("@/features/flows/react-flow/nodes/add-notes/add-notes-editor"),
)
const SendMessageNodeEditor = dynamic(
  () => import("@/features/flows/react-flow/nodes/send-message/editor"),
)
const SplitTrafficNodeEditor = dynamic(
  () => import("@/features/flows/react-flow/nodes/split-traffic/editor"),
)

// biome-ignore lint/suspicious/noExplicitAny: <explanation>
const getEditor = (props: { activeNode: Node<any> }) => {
  return {
    [PanelAction.AddNotes]: <AddNotesEditor />,
    [PanelAction.SendMessage]: <SendMessageNodeEditor {...props} />,
    [PanelAction.SplitTraffic]: <SplitTrafficNodeEditor {...props} />,
  }[props.activeNode.type ?? ""]
}

export function NodeDetailSheet({
  open,
  onOpenChange,
  activeNode,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  activeNode?: Node<any> | null
}) {
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
          {activeNode?.type && getEditor({ activeNode })}
        </div>
      </SheetContent>
    </Sheet>
  )
}
