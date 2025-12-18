import type { ContactNoteModel } from "@aha.chat/database/types"
import { Button } from "@aha.chat/ui/components/ui/button"
import { Label } from "@aha.chat/ui/components/ui/label"
import { PlusIcon } from "lucide-react"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { useChatStore } from "../chat/store/chat-store-provider"
import type { ContactResource } from "../contacts/schemas/resource"
import { AddContactForm } from "./add-contact-note-form"
import { ContactNoteList } from "./contact-notes-list"
import { DeleteContactNoteDialog } from "./delete-contact-note-dialog"
import { EditContactForm } from "./edit-contact-note-form"
import type { ContactNoteResource } from "./schemas/resource"

const contactNoteModes = {
  list: "list",
  add: "add",
  edit: "edit",
  delete: "delete",
} as const

export function ContactNotesManage({
  contactNotes,
}: {
  contactNotes: ContactNoteResource[]
}) {
  const t = useTranslations()
  const { chatbotId } = useParams<{ chatbotId: string }>()

  const [mode, setMode] = useState<keyof typeof contactNoteModes>(
    contactNoteModes.list,
  )

  const { activeConversationId, conversations } = useChatStore((state) => state)
  const [allContactNotes, setAllContactNotes] =
    useState<ContactNoteResource[]>(contactNotes)
  const [contact, setContact] = useState<ContactResource | null>(null)
  const [contactNote, setContactNote] = useState<ContactNoteResource | null>(
    null,
  )

  useEffect(() => {
    if (activeConversationId) {
      const conversation = conversations.find(
        (item) => item.id === activeConversationId,
      )

      if (conversation?.contact) {
        setContact(conversation.contact)
      } else {
        setContact(null)
      }
    } else {
      setContact(null)
    }
  }, [activeConversationId, conversations])

  const resetAction = () => {
    setMode(contactNoteModes.list)
  }

  return (
    <div className="flex w-full flex-col">
      <div className="flex w-full">
        <Label className="flex-1 text-medium">
          {t("fields.notes.label")} ({allContactNotes.length})
        </Label>
        <Button
          onClick={() => setMode(contactNoteModes.add)}
          size="icon"
          variant="ghost"
        >
          <PlusIcon />
        </Button>
      </div>

      {mode === contactNoteModes.add && (
        <AddContactForm
          chatbotId={chatbotId}
          contactId={contact?.id ?? ""}
          onCancel={() => setMode(contactNoteModes.list)}
          onSuccess={(value: ContactNoteModel) => {
            setAllContactNotes([value, ...allContactNotes])
            resetAction()
          }}
        />
      )}
      {!!contactNote && mode === contactNoteModes.edit && (
        <EditContactForm
          chatbotId={chatbotId}
          contactId={contact?.id ?? ""}
          contactNote={contactNote}
          onCancel={() => setMode(contactNoteModes.list)}
          onSuccess={(value: ContactNoteResource) => {
            setAllContactNotes(
              allContactNotes.map((note) =>
                note.id === value.id ? value : (note as ContactNoteResource),
              ),
            )
            resetAction()
          }}
        />
      )}
      {mode === contactNoteModes.delete && (
        <DeleteContactNoteDialog
          chatbotId={chatbotId}
          contactId={contact?.id ?? ""}
          contactNoteId={contactNote?.id ?? ""}
          onCancel={() => setMode(contactNoteModes.list)}
          onOpenChange={(isOpen) => {
            if (!isOpen) {
              setContactNote(null)
            }
          }}
          onSuccess={() => {
            setAllContactNotes(
              allContactNotes.filter(
                (note) => note.id !== (contactNote?.id ?? ""),
              ),
            )
            resetAction()
          }}
          open={Boolean(contactNote)}
        />
      )}
      {mode === contactNoteModes.list && (
        <ContactNoteList
          allContactNotes={allContactNotes}
          onDelete={(value: ContactNoteModel) => {
            setContactNote(value)
            setMode(contactNoteModes.delete)
          }}
          onEdit={(value: ContactNoteModel) => {
            setContactNote(value)
            setMode(contactNoteModes.edit)
          }}
        />
      )}
    </div>
  )
}
