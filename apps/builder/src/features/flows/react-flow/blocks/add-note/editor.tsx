"use client"

import { T } from "@tolgee/react"
import { MessageCircleMore } from "lucide-react"

const AddNoteBlockEditor = ({
  parentName,
  onEdit,
}: { parentName: string; onEdit: (parentName: string) => void }) => {
  return (
    <div
      className="flex justify-center items-center gap-2 p-2 font-bold text-center cursor-pointer break-all rounded-t-lg hover:border-blue-500 hover:border-2"
      onClick={() => onEdit(parentName)}
      onKeyDown={() => {}}
    >
      <MessageCircleMore size={20} className="text-yellow-500" />
      <T keyName="flows.ActionType.AddNote" />
    </div>
  )
}

export { AddNoteBlockEditor }
