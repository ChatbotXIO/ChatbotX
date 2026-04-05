import type { ContactNoteModel } from "@chatbotx.io/database/types"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { PlusIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { z } from "zod"
import { useWorkspaceId } from "@/hooks/routing"
import { useChatStore } from "../chat/store/chat-store-provider"
import type { ContactResource } from "../contacts/schemas/resource"
import { AddContactForm } from "./add-contact-note-form"
import { ContactNoteList } from "./contact-notes-list"
import { DeleteContactNoteDialog } from "./delete-contact-note-dialog"
import { EditContactForm } from "./edit-contact-note-form"
import type { ContactNoteResource } from "./schemas/resource"

const contactNoteModes = z.enum(["list", "add", "edit", "delete"])
type ContactNoteMode = z.infer<typeof contactNoteModes>

export function ContactNotesManage({
  contactNotes,
}: {
  contactNotes: ContactNoteResource[]
}) {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()

  const [mode, setMode] = useState<ContactNoteMode>(contactNoteModes.enum.list)

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
    setMode(contactNoteModes.enum.list)
  }

  return (
    <div className="flex w-full flex-col">
      <div className="flex w-full">
        <Label className="flex-1 text-medium">
          {t("fields.notes.label")} ({allContactNotes.length})
        </Label>
        <Button
          onClick={() => setMode(contactNoteModes.enum.add)}
          size="icon"
          variant="ghost"
        >
          <PlusIcon />
        </Button>
      </div>

      {mode === contactNoteModes.enum.add && (
        <AddContactForm
          contactId={contact?.id}
          onCancel={() => setMode(contactNoteModes.enum.list)}
          onSuccess={(value: ContactNoteModel) => {
            setAllContactNotes([value, ...allContactNotes])
            resetAction()
          }}
          workspaceId={workspaceId}
        />
      )}
      {contactNote && contact && mode === contactNoteModes.enum.edit && (
        <EditContactForm
          contactId={contact.id}
          contactNote={contactNote}
          onCancel={() => setMode(contactNoteModes.enum.list)}
          onSuccess={(value: ContactNoteResource) => {
            setAllContactNotes(
              allContactNotes.map((note) =>
                note.id === value.id ? value : (note as ContactNoteResource),
              ),
            )
            resetAction()
          }}
          workspaceId={workspaceId}
        />
      )}
      {mode === contactNoteModes.enum.delete && contact && contactNote && (
        <DeleteContactNoteDialog
          contactId={contact.id}
          contactNoteId={contactNote.id}
          onCancel={() => setMode(contactNoteModes.enum.list)}
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
          workspaceId={workspaceId}
        />
      )}
      {mode === contactNoteModes.enum.list && (
        <ContactNoteList
          allContactNotes={allContactNotes}
          onDelete={(value: ContactNoteModel) => {
            setContactNote(value)
            setMode(contactNoteModes.enum.delete)
          }}
          onEdit={(value: ContactNoteModel) => {
            setContactNote(value)
            setMode(contactNoteModes.enum.edit)
          }}
        />
      )}
    </div>
  )
}
