"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@aha.chat/ui/components/ui/accordion"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { type ReactNode, useMemo } from "react"
import type { ListConversationItemResource } from "../conversations/schemas/resource"
import { SequenceStoreProvider } from "../sequences/provider/sequence-store-context"
import UpdateContactSequenceField from "./update-contact-sequence-field"

type sequencesList = {
  readonly keyName: string
  readonly content: ReactNode
}

export function ContactSequencesManage({
  contact,
}: {
  contact: NonNullable<ListConversationItemResource["contact"]>
}) {
  const t = useTranslations()
  const { chatbotId } = useParams<{ chatbotId: string }>()

  const sequencesModules: sequencesList[] = useMemo(
    () => [
      {
        keyName: t("sequences.title"),
        content: (
          <UpdateContactSequenceField
            contact={contact}
            sequences={contact.contactsOnSequences || []}
          />
        ),
      },
    ],
    [t, contact],
  )

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
