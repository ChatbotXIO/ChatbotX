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
import type { ContactAppointmentResource } from "../appointments/schemas/resource"
import { useChatStore } from "../chat/store/chat-store-provider"
import { ContactNotesManage } from "../contact-notes/contact-notes-manage"
import type { ContactOnSequenceWithRelations } from "../contact-sequences/schema"
import UpdateContactSequenceField from "../contact-sequences/update-contact-sequence-field"
import { SequenceStoreProvider } from "../sequences/provider/sequence-store-context"
import type { TagResource } from "../tags/schema/resource"
import { ContactAppointmentsList } from "./components/contact-appointments-list"
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
  const [coupons, setCoupons] = useState<
    Array<{ id: string; topicName: string; code: string; usedAt: Date | null }>
  >([])
  const [appointments, setAppointments] = useState<
    ContactAppointmentResource[]
  >([])

  useEffect(() => {
    const contactId = storeContact?.id

    if (!activeConversationId) {
      setContactData(null)
      setCoupons([])
      setAppointments([])
      return
    }

    if (!contactId) {
      setContactData(null)
      setCoupons([])
      setAppointments([])
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

    client.couponsAPI
      .listContactCouponsAPI({ workspaceId, contactId })
      .then(setCoupons)
      .catch(() => setCoupons([]))

    client.appointmentsAPI
      .listContactAppointmentsAPI({ workspaceId, contactId })
      .then(setAppointments)
      .catch(() => setAppointments([]))
  }, [activeConversationId, storeContact?.id, workspaceId])

  const accordionModules: AccordionModule[] = useMemo(() => {
    if (!contactData) {
      return []
    }

    return [
      {
        keyName: t("coupons.title"),
        content: (
          <div className="grid gap-2 px-2 text-sm">
            {coupons.length > 0 ? (
              coupons.map((coupon) => (
                <div className="rounded-md border p-2" key={coupon.id}>
                  <div className="font-medium">{coupon.topicName}</div>
                  <div className="font-mono">{coupon.code}</div>
                  <div className="text-muted-foreground">
                    {coupon.usedAt
                      ? t("coupons.usageStatuses.used")
                      : t("coupons.usageStatuses.notUsed")}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-muted-foreground">
                {t("coupons.messages.empty")}
              </div>
            )}
          </div>
        ),
      },
      {
        keyName: t("appointments.title"),
        content: <ContactAppointmentsList appointments={appointments} />,
      },
      {
        keyName: t("fields.tags.label"),
        content: (
          <UpdateContactTagField
            contact={contactData}
            onSuccess={(updatedTags: TagResource[]) => {
              setContactData({ ...contactData, tags: updatedTags })
            }}
            tags={contactData.tags}
            workspaceId={workspaceId}
          />
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
  }, [contactData, workspaceId, t, coupons, appointments])

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

      <Accordion className="w-full">
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
