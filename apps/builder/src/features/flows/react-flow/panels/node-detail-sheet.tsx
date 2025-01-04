"use client"

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useTranslate } from "@tolgee/react"
import { Node } from "@xyflow/react"
import dynamic from "next/dynamic"
import { PanelAction } from "../types"

import { useNodeEditorStore } from "@/features/flows/react-flow/stores/node-editor-store";

const AddNotesEditor = dynamic(() => import('@/features/flows/react-flow/nodes/add-notes/add-notes-editor'));
const SendMessageEditor = dynamic(() => import('@/features/flows/react-flow/nodes/send-message/send-message-editor'));

export function NodeDetailSheet({ open, onOpenChange, activeNode }: { open: boolean, onOpenChange: (open: boolean) => void, activeNode?: Node | null }) {
  const { t } = useTranslate()
  const { currentNode } = useNodeEditorStore()

  console.log("activeNode.typeactiveNode.typeactiveNode.type", currentNode)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="flex flex-col">
        <SheetHeader>
          <SheetTitle>{currentNode && currentNode.data ? currentNode.data.label as string : "\u00A0"}</SheetTitle>
          <SheetDescription />
        </SheetHeader>
        <div className="flex flex-col flex-1 gap-4">
          {
            currentNode &&
            currentNode.type == PanelAction.AddNotes &&
            <AddNotesEditor />
          }

          {
            currentNode &&
            currentNode.type == PanelAction.SendMessage &&
            <SendMessageEditor />
          }
        </div>
      </SheetContent>
    </Sheet>
  )
}
