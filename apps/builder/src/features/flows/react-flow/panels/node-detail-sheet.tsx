"use client"

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useTranslate } from "@tolgee/react"
import { Node } from "@xyflow/react"
import dynamic from "next/dynamic"
import { PanelAction } from "../types"

const AddNotesEditor = dynamic(() => import('@/features/flows/react-flow/nodes/add-notes/add-notes-editor'));
const SendMessageEditor = dynamic(() => import('@/features/flows/react-flow/nodes/send-message/send-message-editor'));

export function NodeDetailSheet({ open, onOpenChange, activeNode }: { open: boolean, onOpenChange: (open: boolean) => void, activeNode?: Node | null }) {
  const { t } = useTranslate()

  console.log("activeNode.typeactiveNode.typeactiveNode.type", activeNode)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="flex flex-col">
        <SheetHeader>
          <SheetTitle>{activeNode && activeNode.data ? activeNode.data.label as string : "\u00A0"}</SheetTitle>
          <SheetDescription />
        </SheetHeader>
        <div className="flex flex-col flex-1 gap-4">
          {
            activeNode &&
            activeNode.type == PanelAction.AddNotes &&
            <AddNotesEditor />
          }

          {
            activeNode &&
            activeNode.type == PanelAction.SendMessage &&
            <SendMessageEditor />
          }
        </div>
      </SheetContent>
    </Sheet>
  )
}
