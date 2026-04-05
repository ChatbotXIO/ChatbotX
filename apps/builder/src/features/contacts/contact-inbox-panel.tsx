import type { ContactNoteModel, TagModel } from "@chatbotx.io/database/types"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@chatbotx.io/ui/components/ui/accordion"
import { useTranslations } from "next-intl"
import { type ReactNode, useEffect, useMemo, useState } from "react"
import { useChatStore } from "../chat/store/chat-store-provider"
import { ContactNotesManage } from "../contact-notes/contact-notes-manage"
import { ContactSequencesManage } from "../contact-sequences/contact-sequences-manage"
import type { ListConversationItemResource } from "../conversations/schema/resource"
import { TagStoreProvider } from "../tags/provider/tag-store-context"
import UpdateContactTagField from "./components/update-contact-tag-field"
import { ContactDetail } from "./contact-detail"

type InboxModule = {
  readonly keyName: string
  readonly content: ReactNode
}

export const ContactInboxPanel = ({ workspaceId }: { workspaceId: string }) => {
  const t = useTranslations()

  const { activeConversationId, conversations } = useChatStore((state) => state)
  const [contact, setContact] =
    useState<ListConversationItemResource["contact"]>(null)
  const [contactNotes, setContactNotes] = useState<ContactNoteModel[]>([])
  const [tags, setTags] = useState<TagModel[]>([])

  useEffect(() => {
    if (activeConversationId) {
      const conversation = conversations.find(
        (item) => item.id === activeConversationId,
      )

      if (conversation?.contact) {
        setContact(conversation.contact)
        setContactNotes([] as ContactNoteModel[])
        setTags([] as TagModel[])
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
                <TagStoreProvider workspaceId={workspaceId}>
                  <UpdateContactTagField
                    contact={contact}
                    onSuccess={setTags}
                    tags={tags}
                    workspaceId={workspaceId}
                  />
                </TagStoreProvider>
              ),
            },
          ]
        : [],
    [workspaceId, t, contact, tags],
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
              <AccordionTrigger className="rounded-none border-t p-2 transition-all hover:bg-gray-200 hover:no-underline data-[state=open]:bg-gray-200">
                <div className="flex items-center gap-2">{module.keyName}</div>
              </AccordionTrigger>
              <AccordionContent>{module.content}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        {contact && <ContactSequencesManage contact={contact} />}
      </div>
    )
  )
}
