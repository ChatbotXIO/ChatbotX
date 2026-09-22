"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@chatbotx.io/ui/components/ui/accordion"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useMemo, useState } from "react"
import { orpc } from "@/lib/orpc/query"
import { useChatStore } from "../chat/store/chat-store-provider"
import { ContactNotesManage } from "../contact-notes/contact-notes-manage"
import UpdateContactSequenceField, {
  type ContactSequence,
} from "../contact-sequences/update-contact-sequence-field"
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

  const contactId = storeContact?.id
  const contactQueryOptions =
    orpc.contactsAPIs.getContactAuthenticatedAPI.queryOptions({
      input: { workspaceId, contactId: contactId ?? "" },
      enabled: Boolean(activeConversationId && contactId),
      initialData:
        seededContact && seededContact.id === contactId
          ? seededContact
          : undefined,
    })
  const { data: contactData = null } = useQuery(contactQueryOptions)
  const queryClient = useQueryClient()

  const setContactData = useCallback(
    (
      updater: (
        previousContact: GetContactResponse | null,
      ) => GetContactResponse | null,
    ) => {
      queryClient.setQueryData(
        contactQueryOptions.queryKey,
        (previousContact) => updater(previousContact ?? null) ?? undefined,
      )
    },
    [contactQueryOptions.queryKey, queryClient],
  )
  const onProfileUpdated = useCallback(
    () =>
      queryClient.invalidateQueries({
        queryKey: contactQueryOptions.queryKey,
      }),
    [contactQueryOptions.queryKey, queryClient],
  )

  useAutoRefreshContactProfile({
    workspaceId,
    conversation: activeConversation,
    setContactData,
    onProfileUpdated,
  })
  const [openAccordionItems, setOpenAccordionItems] = useState<string[]>([])

  // biome-ignore lint/correctness/useExhaustiveDependencies: activeConversationId is a trigger-only dependency; the effect resets accordion state on conversation switch without reading the value itself
  useEffect(() => {
    setOpenAccordionItems([])
  }, [activeConversationId])

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
              setContactData((previousContact) =>
                previousContact
                  ? { ...previousContact, tags: updatedTags }
                  : null,
              )
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
  }, [contactData, workspaceId, t, setContactData])

  if (!storeContact) {
    return null
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <ContactDetail
        activeConversationId={activeConversationId}
        contact={contactData}
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
  const t = useTranslations()
  const queryClient = useQueryClient()
  const queryOptions =
    orpc.contactNotesAPI.listContactNotesAuthenticatedAPI.queryOptions({
      input: { workspaceId, contactId },
    })
  const { data, isError } = useQuery(queryOptions)

  if (isError) {
    return (
      <div className="px-2 text-muted-foreground text-sm">
        {t("messages.errorLoadingData")}
      </div>
    )
  }

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
  const t = useTranslations()
  const queryClient = useQueryClient()
  const queryOptions =
    orpc.contactSequencesAPI.listContactSequencesAuthenticatedAPI.queryOptions({
      input: { workspaceId, contactId },
    })
  const { data, isError } = useQuery(queryOptions)
  const sequences: ContactSequence[] = useMemo(
    () =>
      (data?.data ?? []).map((sequence) => ({
        sequence: {
          id: sequence.sequenceId,
          name: sequence.sequenceName,
        },
      })),
    [data?.data],
  )

  if (isError) {
    return (
      <div className="px-2 text-muted-foreground text-sm">
        {t("messages.errorLoadingData")}
      </div>
    )
  }

  return (
    <UpdateContactSequenceField
      contact={contact}
      onSuccess={(updatedSequences: ContactSequence[]) => {
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
  const {
    data: coupons = [],
    isError,
    isPending,
  } = useQuery(
    orpc.couponsAPI.listContactCouponsAPI.queryOptions({
      input: { workspaceId, contactId },
    }),
  )

  if (isPending) {
    return (
      <div className="flex justify-center px-2 py-4">
        <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="px-2 text-muted-foreground text-sm">
        {t("messages.errorLoadingData")}
      </div>
    )
  }

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
  const t = useTranslations()
  const {
    data: appointments = [],
    isError,
    isPending,
  } = useQuery(
    orpc.appointmentsAPI.listContactAppointmentsAPI.queryOptions({
      input: { workspaceId, contactId },
    }),
  )

  if (isPending) {
    return (
      <div className="flex justify-center px-2 py-4">
        <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (isError) {
    return (
      <div className="px-2 text-muted-foreground text-sm">
        {t("messages.errorLoadingData")}
      </div>
    )
  }

  return <ContactAppointmentsList appointments={appointments} />
}
