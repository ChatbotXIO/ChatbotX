"use client"

import type { AddNoteBlockSchema } from "@/features/flows/react-flow/blocks/add-note/schema"
import { T } from "@tolgee/react"
import { MessageCircleMore } from "lucide-react"

export const AddNoteBlockViewer = ({ data }: { data: AddNoteBlockSchema }) => {
  return (
    <div className="w-full py-4">
      <div className="flex items-center justify-center gap-2 font-bold text-center break-all">
        <MessageCircleMore size={18} className="text-yellow-500" />
        <T keyName="flows.ActionType.AddNote" />
      </div>
      <div className="text-center">{data.message}</div>
    </div>
  )
}
