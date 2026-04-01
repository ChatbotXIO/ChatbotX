import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { formatDate } from "@chatbotx.io/ui/lib/format"
import { CircleUserRound, PencilIcon, TrashIcon } from "lucide-react"
import type { ContactNoteResource } from "./schemas/resource"

export function ContactNoteList({
  allContactNotes,
  onEdit,
  onDelete,
}: {
  allContactNotes: ContactNoteResource[]
  onEdit: (contactNote: ContactNoteResource) => void
  onDelete: (contactNote: ContactNoteResource) => void
}) {
  return (
    <div className="flex w-full flex-col">
      {allContactNotes.map((contactNote) => (
        <div className="flex w-full flex-col" key={contactNote.id}>
          <div className="flex w-full">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex flex-1 items-center gap-2 text-sm">
                    <CircleUserRound />
                    <div>
                      {formatDate(contactNote.updatedAt, {
                        month: "short",
                      })}
                    </div>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{contactNote.createdBy?.name ?? "Unknown"}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Button
              onClick={() => onEdit(contactNote)}
              size="icon"
              variant="ghost"
            >
              <PencilIcon />
            </Button>
            <Button
              className="text-destructive"
              onClick={() => onDelete(contactNote)}
              size="sm"
              variant="ghost"
            >
              <TrashIcon />
            </Button>
          </div>
          <div className="mb-4 w-full whitespace-pre-wrap text-gray-500 text-sm">
            {contactNote.text}
          </div>
        </div>
      ))}
    </div>
  )
}
