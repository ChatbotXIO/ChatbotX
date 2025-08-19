// import { use } from "react";
// import type { listContactNotes } from "./queries/list-contact-notes.query";

import { Button } from "@aha.chat/ui/components/ui/button"
import { Label } from "@aha.chat/ui/components/ui/label"
import { PencilIcon, PlusIcon, TrashIcon } from "lucide-react"
import type { ContactNoteCollection } from "./schemas/types"

// interface ContactNotesListProps {
//   chatbotId: string,
//   promises: Promise<[Awaited<ReturnType<typeof listContactNotes>>]>
// }

export function ContactNotesList() {
  const listContactNotes: ContactNoteCollection = { data: [] }

  return (
    <div className="flex w-full flex-col">
      <div className="flex w-full">
        <Label className="flex-1 text-medium">
          Notes ({listContactNotes.data.length})
        </Label>
        <Button size="icon" variant="ghost">
          <PlusIcon />
        </Button>
      </div>
      <div className="flex w-full flex-col">
        {listContactNotes.data.map((contactNote) => {
          return (
            <div className="flex w-full flex-col" key={contactNote.id}>
              <div className="flex w-full">
                <div className="flex-1">{contactNote.createdById}</div>
                <Button size="icon" variant="ghost">
                  <PencilIcon />
                </Button>
                <Button size="icon" variant="ghost">
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
