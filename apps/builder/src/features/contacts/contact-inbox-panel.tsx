"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@chatbotx.io/ui/components/ui/accordion"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { client } from "@/lib/orpc/orpc"
import type { ContactAppointmentResource } from "../appointments/schema/resource"
import { useChatStore } from "../chat/store/chat-store-provider"
import { ContactNotesManage } from "../contact-notes/contact-notes-manage"
import type { ContactOnSequenceWithRelations } from "../contact-sequences/schema"
import UpdateContactSequenceField from "../contact-sequences/update-contact-sequence-field"
import { SequenceStoreProvider } from "../sequences/provider/sequence-store-context"
import type { TagResource } from "../tags/schema/resource"
import { ContactAppointmentsList } from "./components/contact-appointments-list"
import UpdateContactTagField from "./components/update-contact-tag-field"
import { ContactDetail } from "./contact-detail"
import { useAutoRefreshContactProfile } from "./hooks/use-auto-refresh-contact-profile"
import type { GetContactResponse } from "./schema/query"

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

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === activeConversationId) ?? null,
    [conversations, activeConversationId],
  )
  const storeContact = activeConversation?.contact ?? null

  const [contactData, setContactData] = useState<GetContactResponse | null>(
    null,
  )

  // Guards `getContactAuthenticatedAPI` against out-of-order resolution:
  // the initial fetch (below) and the auto-refresh convergence re-fetch
  // (`onProfileUpdated`) can both be in flight for the same contact, and
  // whichever request was issued LAST must win regardless of which settles
  // first — otherwise a slow initial fetch resolving after the refresh
  // patch would silently overwrite the just-applied name/avatar.
  const requestSeqRef = useRef(0)

  const fetchContactData = useCallback(
    (contactId: string, options?: { preserveOnError?: boolean }) => {
      const seq = ++requestSeqRef.current
      client.contactsAPIs
        .getContactAuthenticatedAPI({ workspaceId, contactId })
        .then((data) => {
          if (requestSeqRef.current === seq) {
            setContactData(data)
          }
        })
        .catch(() => {
          // On the INITIAL open fetch, a failure must clear stale data from
          // the previous contact. On the auto-refresh convergence re-fetch
          // (`preserveOnError: true`), the hook has already patched
          // `contactData` with the fresh name/avatar — a transport blip on
          // this re-fetch must not wipe that out; keeping the patched state
          // is strictly better than showing nothing.
          if (requestSeqRef.current === seq && !options?.preserveOnError) {
            setContactData(null)
          }
        })
    },
    [workspaceId],
  )

  useAutoRefreshContactProfile({
    workspaceId,
    conversation: activeConversation,
    setContactData,
    // Re-fetch the canonical contact once the auto-refresh applies an
    // update, so `contactData` converges even if the initial fetch below is
    // still in flight and resolves afterwards.
    onProfileUpdated: (contactId) =>
      fetchContactData(contactId, { preserveOnError: true }),
  })
  const [coupons, setCoupons] = useState<
    Array<{ id: string; topicName: string; code: string; usedAt: Date | null }>
  >([])
  const [appointments, setAppointments] = useState<
    ContactAppointmentResource[]
  >([])

  useEffect(() => {
    const contactId = storeContact?.id

    if (!activeConversationId) {
      requestSeqRef.current += 1
      setContactData(null)
      setCoupons([])
      setAppointments([])
      return
    }

    if (!contactId) {
      requestSeqRef.current += 1
      setContactData(null)
      setCoupons([])
      setAppointments([])
      return
    }

    fetchContactData(contactId)

    client.couponsAPI
      .listContactCouponsAPI({ workspaceId, contactId })
      .then(setCoupons)
      .catch(() => setCoupons([]))

    client.appointmentsAPI
      .listContactAppointmentsAPI({ workspaceId, contactId })
      .then(setAppointments)
      .catch(() => setAppointments([]))
  }, [activeConversationId, storeContact?.id, workspaceId, fetchContactData])

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
