"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@aha.chat/ui/components/ui/accordion"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { type ReactNode, useEffect, useState } from "react"
import { useChatStore } from "../chat/store/chat-store-provider"
import type { ContactResource } from "../contacts/schemas/resource"
import { SequenceStoreProvider } from "../sequences/provider/sequence-store-context"
import type { ContactOnSequenceWithRelations } from "./schema"
import UpdateContactSequenceField from "./update-contact-sequence-field"

type sequencesList = {
  readonly keyName: string
  readonly content: ReactNode
}

export function ContactSequencesManage({
  contactOnSequences: initialContactOnSequences,
}: {
  contactOnSequences: ContactOnSequenceWithRelations[]
}) {
  const t = useTranslations()
  const { chatbotId } = useParams<{ chatbotId: string }>()
  const { activeConversationId, conversations } = useChatStore((state) => state)

  const [contact, setContact] = useState<ContactResource | null>(null)
  const [contactOnSequences, setContactOnSequences] = useState<
    ContactOnSequenceWithRelations[]
  >(initialContactOnSequences)

  useEffect(() => {
    if (activeConversationId) {
      const conversation = conversations.find(
        (item) => item.id === activeConversationId,
      )

      if (conversation?.contact) {
        setContact(conversation.contact)
        setContactOnSequences(conversation.contact.contactsOnSequences || [])
      } else {
        setContact(null)
      }
    }
  }, [activeConversationId, conversations])

  const sequencesModules: sequencesList[] = contact
    ? [
        {
          keyName: t("sequences.title"),
          content: (
            <UpdateContactSequenceField
              contact={contact}
              onSuccess={setContactOnSequences}
              sequences={contactOnSequences}
            />
          ),
        },
      ]
    : []

  return (
    <SequenceStoreProvider autoInitialize={true} chatbotId={chatbotId}>
      <Accordion className="w-full" collapsible type="single">
        {sequencesModules.map((module) => (
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
    </SequenceStoreProvider>
  )
}
