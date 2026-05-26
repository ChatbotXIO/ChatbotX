"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@chatbotx.io/ui/components/ui/accordion"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"
import { client } from "@/lib/orpc/orpc"
import { useChatStore } from "../chat/store/chat-store-provider"
import { ContactNotesManage } from "../contact-notes/contact-notes-manage"
import type { ContactOnSequenceWithRelations } from "../contact-sequences/schema"
import UpdateContactSequenceField from "../contact-sequences/update-contact-sequence-field"
import { SequenceStoreProvider } from "../sequences/provider/sequence-store-context"
import { TagStoreProvider } from "../tags/provider/tag-store-context"
import type { TagResource } from "../tags/schema/resource"
import UpdateContactTagField from "./components/update-contact-tag-field"
import { ContactDetail } from "./contact-detail"
import type { GetContactResponse } from "./schemas/query"

type AccordionModule = {
  readonly keyName: string
  readonly content: React.ReactNode
}

export const ContactInboxPanel = ({
  workspaceId,
  activeConversationId,
}: {
  workspaceId: string
  activeConversationId: string | null
}) => {
  const t = useTranslations()

  const { conversations } = useChatStore((state) => state)

  const storeContact = useMemo(
    () =>
      conversations.find((c) => c.id === activeConversationId)?.contact ?? null,
    [conversations, activeConversationId],
  )

  const [contactData, setContactData] = useState<GetContactResponse | null>(
    null,
  )

  useEffect(() => {
    const contactId = storeContact?.id

    if (!activeConversationId) {
      setContactData(null)
      return
    }

    if (!contactId) {
      setContactData(null)
      return
    }

    client.contactsAPIs
      .getContactAuthenticatedAPI({ workspaceId, contactId })
      .then((data) => {
        setContactData(data)
      })
      .catch(() => {
        setContactData(null)
      })
  }, [activeConversationId, storeContact?.id, workspaceId])

  const accordionModules: AccordionModule[] = useMemo(() => {
    if (!contactData) {
      return []
    }

    return [
      {
        keyName: t("fields.tags.label"),
        content: (
          <TagStoreProvider workspaceId={workspaceId}>
            <UpdateContactTagField
              contact={contactData}
              onSuccess={(updatedTags: TagResource[]) => {
                setContactData({ ...contactData, tags: updatedTags })
              }}
              tags={contactData.tags}
              workspaceId={workspaceId}
            />
          </TagStoreProvider>
        ),
      },
      {
        keyName: t("sequences.title"),
        content: (
          <SequenceStoreProvider
            autoInitialize={true}
            workspaceId={workspaceId}
          >
            <UpdateContactSequenceField
              contact={contactData}
              onSuccess={(updatedSequences) => {
                setContactData({
                  ...contactData,
                  contactsOnSequences:
                    updatedSequences as ContactOnSequenceWithRelations[],
                })
              }}
              sequences={
                contactData.contactsOnSequences as ContactOnSequenceWithRelations[]
              }
            />
          </SequenceStoreProvider>
        ),
      },
    ]
  }, [contactData, workspaceId, t])

  if (!storeContact) {
    return null
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <ContactDetail
        activeConversationId={activeConversationId}
        contact={contactData}
      />

      <ContactNotesManage contactNotes={contactData?.contactNotes ?? []} />

      <Accordion className="w-full" collapsible type="single">
        {accordionModules.map((module, index) => (
          <AccordionItem
            className="transition-all hover:data-[state=open]:rounded-none"
            key={module.keyName}
            value={module.keyName}
          >
            <AccordionTrigger
              className={`rounded-none p-2 transition-all ${index === 0 ? "border-t" : ""}`}
            >
              <div className="flex items-center gap-2">{module.keyName}</div>
            </AccordionTrigger>
            <AccordionContent>{module.content}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  )
}
