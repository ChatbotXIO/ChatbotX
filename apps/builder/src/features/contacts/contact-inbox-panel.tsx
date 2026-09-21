"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@chatbotx.io/ui/components/ui/accordion"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { client } from "@/lib/orpc/orpc"
import { orpc } from "@/lib/orpc/query"
import { useChatStore } from "../chat/store/chat-store-provider"
import { ContactNotesManage } from "../contact-notes/contact-notes-manage"
import UpdateContactSequenceField from "../contact-sequences/update-contact-sequence-field"
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

  const { conversations, seededContact } = useChatStore((state) => state)

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
  const issuedForRef = useRef<string | null>(null)

  const fetchContactData = useCallback(
    (contactId: string, preserveOnError = false) => {
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
          if (requestSeqRef.current === seq && !preserveOnError) {
            setContactData(null)
          }
        })
    },
    [workspaceId],
  )

  // Re-fetch the canonical contact once the auto-refresh applies an update,
  // so `contactData` converges even if the initial fetch below is still in
  // flight and resolves afterwards.
  const onProfileUpdated = useCallback(
    (contactId: string) => fetchContactData(contactId, true),
    [fetchContactData],
  )

  useAutoRefreshContactProfile({
    workspaceId,
    conversation: activeConversation,
    setContactData,
    onProfileUpdated,
  })
  const [openAccordionItems, setOpenAccordionItems] = useState<string[]>([])

  useEffect(() => {
    const contactId = storeContact?.id

    if (!(activeConversationId && contactId)) {
      requestSeqRef.current += 1
      issuedForRef.current = null
      setContactData(null)
      setOpenAccordionItems([])
      return
    }

    const issuedFor = `${activeConversationId}:${contactId}`
    if (issuedForRef.current === issuedFor) {
      return
    }
    issuedForRef.current = issuedFor

    if (seededContact?.id === contactId) {
      requestSeqRef.current += 1
      setContactData(seededContact)
      return
    }

    fetchContactData(contactId)
  }, [activeConversationId, storeContact?.id, seededContact, fetchContactData])

  const accordionModules: AccordionModule[] = useMemo(() => {
    if (!contactData) {
      return []
    }

    return [
      {
        keyName: t("coupons.title"),
        content: (
          <ContactCouponsSection
            contactId={contactData.id}
            workspaceId={workspaceId}
          />
        ),
      },
      {
        keyName: t("appointments.title"),
        content: (
          <ContactAppointmentsSection
            contactId={contactData.id}
            workspaceId={workspaceId}
          />
        ),
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
          <ContactSequencesSection
            contact={contactData}
            contactId={contactData.id}
            workspaceId={workspaceId}
          />
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
        onCustomFieldsReset={() =>
          setContactData((previous) =>
            previous ? { ...previous, customFields: [] } : previous,
          )
        }
      />

      {contactData?.id ? (
        <ContactNotesSection
          contactId={contactData.id}
          workspaceId={workspaceId}
        />
      ) : null}

      <Accordion
        className="w-full"
        onValueChange={(value) => setOpenAccordionItems(value as string[])}
        value={openAccordionItems}
      >
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
            <AccordionContent>
              {openAccordionItems.includes(module.keyName)
                ? module.content
                : null}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  )
}

function ContactNotesSection({
  workspaceId,
  contactId,
}: {
  workspaceId: string
  contactId: string
}) {
  const queryClient = useQueryClient()
  const queryOptions =
    orpc.contactNotesAPI.listContactNotesAuthenticatedAPI.queryOptions({
      input: { workspaceId, contactId },
    })
  const { data } = useQuery(queryOptions)

  return (
    <ContactNotesManage
      contactNotes={data?.data ?? []}
      onNotesChange={(notes) => {
        queryClient.setQueryData(queryOptions.queryKey, { data: notes })
      }}
    />
  )
}

function ContactSequencesSection({
  workspaceId,
  contactId,
  contact,
}: {
  workspaceId: string
  contactId: string
  contact: GetContactResponse
}) {
  const queryClient = useQueryClient()
  const queryOptions =
    orpc.contactSequencesAPI.listContactSequencesAuthenticatedAPI.queryOptions({
      input: { workspaceId, contactId },
    })
  const { data } = useQuery(queryOptions)
  const sequences = useMemo(
    () =>
<<<<<<< HEAD
      (data?.data ?? []).map((sequence) => ({
        sequenceId: sequence.sequenceId,
        sequence: {
          id: sequence.sequenceId,
          name: sequence.sequenceName,
        },
      })),
    [data?.data],
=======
      (data?.data ?? []).map(
        (sequence) =>
          ({
            contactId,
            sequenceId: sequence.sequenceId,
            sequence: {
              id: sequence.sequenceId,
              name: sequence.sequenceName,
            },
          }) as ContactOnSequenceWithRelations,
      ),
    [contactId, data?.data],
>>>>>>> 64ac9d6b6 (perf(inbox): prefetch initial inbox state and replace zustand stores with tanstack query)
  )

  return (
    <UpdateContactSequenceField
      contact={contact}
      onSuccess={(updatedSequences) => {
        queryClient.setQueryData(queryOptions.queryKey, {
          data: updatedSequences.map((sequence) => ({
            sequenceId: sequence.sequence.id,
            sequenceName: sequence.sequence.name,
          })),
        })
      }}
      sequences={sequences}
    />
  )
}

function ContactCouponsSection({
  workspaceId,
  contactId,
}: {
  workspaceId: string
  contactId: string
}) {
  const t = useTranslations()
  const { data: coupons = [] } = useQuery(
    orpc.couponsAPI.listContactCouponsAPI.queryOptions({
      input: { workspaceId, contactId },
    }),
  )

  return (
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
  )
}

function ContactAppointmentsSection({
  workspaceId,
  contactId,
}: {
  workspaceId: string
  contactId: string
}) {
  const { data: appointments = [] } = useQuery(
    orpc.appointmentsAPI.listContactAppointmentsAPI.queryOptions({
      input: { workspaceId, contactId },
    }),
  )

  return <ContactAppointmentsList appointments={appointments} />
}
