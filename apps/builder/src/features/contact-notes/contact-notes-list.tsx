// import { use } from "react";
// import type { listContactNotes } from "./queries/list-contact-notes.query";
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { PencilIcon, PlusIcon, TrashIcon } from "lucide-react"
import type { ContactNoteCollection } from "./schemas/types"

// interface ContactNotesListProps {
//   chatbotId: string,
//   promises: Promise<[Awaited<ReturnType<typeof listContactNotes>>]>
// }

export function ContactNotesList() {
  const listContactNotes: ContactNoteCollection = { data: [] }

  return (
    <div className="flex flex-col w-full">
      <div className="flex w-full">
        <Label className="flex-1 text-medium">
          Notes ({listContactNotes.data.length})
        </Label>
        <Button variant="ghost" size="icon">
          <PlusIcon />
        </Button>
      </div>
      <div className="flex flex-col w-full">
        {listContactNotes.data.map((contactNote) => {
          return (
            <div className="flex flex-col w-full" key={contactNote.id}>
              <div className="flex w-full">
                <div className="flex-1">{contactNote.createdById}</div>
                <Button variant="ghost" size="icon">
                  <PencilIcon />
                </Button>
                <Button variant="ghost" size="icon">
                  <TrashIcon />
                </Button>
              </div>
              <div className="w-full">{contactNote.content}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
