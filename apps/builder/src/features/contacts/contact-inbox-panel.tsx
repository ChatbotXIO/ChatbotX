import type { ContactNoteModel, TagModel } from "@aha.chat/database/types"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@aha.chat/ui/components/ui/accordion"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { type ReactNode, useEffect, useMemo, useState } from "react"
import { useChatStore } from "../chat/store/chat-store-provider"
import { ContactNotesManage } from "../contact-notes/contact-notes-manage"
import { TagStoreProvider } from "../tags/provider/tag-store-context"
import UpdateContactTagField from "./components/update-contact-tag-field"
import { ContactDetail } from "./contact-detail"
import type { ContactResource } from "./schemas/resource"

type InboxModule = {
  readonly keyName: string
  readonly content: ReactNode
}

export const ContactInboxPanel = () => {
  const t = useTranslations()
  const { chatbotId } = useParams<{ chatbotId: string }>()

  const { activeConversationId, conversations } = useChatStore((state) => state)
  const [contact, setContact] = useState<ContactResource | null>(null)
  const [contactNotes, setContactNotes] = useState<ContactNoteModel[]>([])
  const [tags, setTags] = useState<TagModel[]>([])

  useEffect(() => {
    if (activeConversationId) {
      const conversation = conversations.find(
        (item) => item.id === activeConversationId,
      )

      if (conversation?.contact) {
        setContact(conversation.contact)
        // TODO: get contact notes and tags from conversation
        setContactNotes([] as ContactNoteModel[])
        setTags([] as TagModel[])
        // setContactNotes(conversation.contact.contactNotes || [])
        // setTags(conversation.contact.tags || [])
      } else {
        setContact(null)
      }
    }
  }, [activeConversationId, conversations])

  const inboxModules: InboxModule[] = useMemo(
    () =>
      contact
        ? [
            {
              keyName: t("fields.tags.label"),
              content: (
                <TagStoreProvider chatbotId={chatbotId}>
                  <UpdateContactTagField
                    contact={contact}
                    onSuccess={setTags}
                    tags={tags}
                  />
                </TagStoreProvider>
              ),
            },
          ]
        : [],
    [chatbotId, t, contact, tags],
  )

  return (
    contact && (
      <div className="flex w-full flex-col gap-2">
        <ContactDetail />

        <ContactNotesManage contactNotes={contactNotes} />

        <Accordion className="w-full" collapsible type="single">
          {inboxModules.map((module) => (
            <AccordionItem
              className="transition-all hover:rounded-lg hover:data-[state=open]:rounded-none"
              key={module.keyName}
              value={module.keyName}
            >
              <AccordionTrigger className="rounded-none border-t p-2 transition-all hover:bg-muted hover:no-underline data-[state=open]:bg-muted">
                <div className="flex items-center gap-2">{module.keyName}</div>
              </AccordionTrigger>
              <AccordionContent>{module.content}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    )
  )
}
