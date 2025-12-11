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

const contactNoteActions = {
  LIST: 1,
  ADD: 2,
  EDIT: 3,
  DELETE: 4,
}

export function ContactNotesManage({
  contactNotes,
}: {
  contactNotes: ContactNoteResource[]
}) {
  const t = useTranslations()
  const { chatbotId } = useParams<{ chatbotId: string }>()

  const [contactNoteAction, setContactNoteAction] = useState(
    contactNoteActions.LIST,
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
    setContactNoteAction(contactNoteActions.LIST)
  }

  return (
    <div className="flex w-full flex-col">
      <div className="flex w-full">
        <Label className="flex-1 text-medium">
          {t("fields.notes.label")} ({allContactNotes.length})
        </Label>
        <Button
          onClick={() => setContactNoteAction(contactNoteActions.ADD)}
          size="icon"
          variant="ghost"
        >
          <PlusIcon />
        </Button>
      </div>
      {contactNoteAction === contactNoteActions.ADD && (
        <AddContactForm
          chatbotId={chatbotId}
          contactId={contact?.id ?? ""}
          onCancel={() => setContactNoteAction(contactNoteActions.LIST)}
          onSuccess={(value: ContactNoteModel) => {
            setAllContactNotes([value, ...allContactNotes])
            resetAction()
          }}
        />
      )}
      {contactNote && contactNoteAction === contactNoteActions.EDIT && (
        <EditContactForm
          chatbotId={chatbotId}
          contactId={contact?.id ?? ""}
          contactNote={contactNote}
          onCancel={() => setContactNoteAction(contactNoteActions.LIST)}
          onSuccess={(value: ContactNoteModel) => {
            setAllContactNotes(
              allContactNotes.map((note) =>
                note.id === value.id ? value : note,
              ),
            )
            resetAction()
          }}
        />
      )}
      {contactNoteAction === contactNoteActions.DELETE && (
        <DeleteContactNoteDialog
          chatbotId={chatbotId}
          contactNoteId={contactNote?.id ?? ""}
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
      {contactNoteAction === contactNoteActions.LIST && (
        <ContactNoteList
          allContactNotes={allContactNotes}
          onDelete={(value: ContactNoteModel) => {
            setContactNote(value)
            setContactNoteAction(contactNoteActions.DELETE)
          }}
          onEdit={(value: ContactNoteModel) => {
            setContactNote(value)
            setContactNoteAction(contactNoteActions.EDIT)
          }}
        />
      )}
    </div>
  )
}
