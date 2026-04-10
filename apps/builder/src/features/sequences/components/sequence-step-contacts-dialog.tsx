"use client"

import type {
  SequenceStepContactData,
  SequenceStepEventType,
} from "@chatbotx.io/analytics/schemas"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { ScrollArea } from "@chatbotx.io/ui/components/ui/scroll-area"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { memo, useCallback, useEffect, useState } from "react"
import { getAvatarUrl, getFullName } from "@/features/contacts/utils"
import { InboxIcon } from "@/features/inboxes/components/inbox-icon"
import { client } from "@/lib/orpc/orpc"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  sequenceId: string
  stepId: string
  eventType: SequenceStepEventType
  total: number
}

export const SequenceStepContactsDialog = memo(
  function SequenceStepContactsDialog({
    open,
    onOpenChange,
    workspaceId,
    sequenceId,
    stepId,
    eventType,
    total,
  }: Props) {
    const t = useTranslations()
    const [page, setPage] = useState(1)
    const [isLoading, setIsLoading] = useState(false)
    const [contacts, setContacts] = useState<SequenceStepContactData[]>([])
    const [pageCount, setPageCount] = useState(1)
    const perPage = 20

    const fetchContacts = useCallback(async () => {
      if (!open) {
        return
      }

      setIsLoading(true)
      try {
        const result =
          await client.sequencesAPI.privateListSequenceStepContactsAPI({
            workspaceId,
            sequenceId,
            stepId,
            eventType,
            total,
            page,
            perPage,
          })
        setContacts(result.data)
        setPageCount(result.pageCount)
      } catch (error) {
        console.error("Failed to fetch sequence step contacts:", error)
      } finally {
        setIsLoading(false)
      }
    }, [open, workspaceId, sequenceId, stepId, eventType, total, page])

    useEffect(() => {
      fetchContacts()
    }, [fetchContacts])

    useEffect(() => {
      if (open) {
        setPage(1)
      }
    }, [open])

    const handlePrevPage = useCallback(() => {
      setPage((p) => Math.max(1, p - 1))
    }, [])

    const handleNextPage = useCallback(() => {
      setPage((p) => Math.min(pageCount, p + 1))
    }, [pageCount])

    return (
      <Dialog onOpenChange={onOpenChange} open={open}>
        <DialogContent className="flex max-h-[100vh] flex-col sm:max-w-2xl">
          <DialogHeader className="mb-2">
            <DialogTitle>
              {t(`sequences.stats.${eventType}`)} ({total.toLocaleString()})
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[50vh] flex-1">
            {isLoading && (
              <div className="space-y-2">
                <ContactItemSkeleton />
                <ContactItemSkeleton />
                <ContactItemSkeleton />
                <ContactItemSkeleton />
                <ContactItemSkeleton />
              </div>
            )}
            {!isLoading && contacts.length === 0 && (
              <div className="py-8 text-center text-muted-foreground text-sm">
                {t("sequences.stats.noContacts")}
              </div>
            )}
            {!isLoading && contacts.length > 0 && (
              <div className="space-y-2 pr-4">
                {contacts.map((contact) => (
                  <ContactItem
                    contact={contact}
                    key={contact.contactId}
                    workspaceId={workspaceId}
                  />
                ))}
              </div>
            )}
          </ScrollArea>

          {pageCount > 1 && (
            <div className="flex items-center justify-between border-t pt-4">
              <span className="text-muted-foreground text-sm">
                {t("sequences.stats.pageInfo", { page, pageCount })}
              </span>
              <div className="flex gap-2">
                <Button
                  disabled={page === 1 || isLoading}
                  onClick={handlePrevPage}
                  size="sm"
                  variant="outline"
                >
                  <ChevronLeftIcon className="size-4" />
                </Button>
                <Button
                  disabled={page === pageCount || isLoading}
                  onClick={handleNextPage}
                  size="sm"
                  variant="outline"
                >
                  <ChevronRightIcon className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    )
  },
)

const ContactItem = memo(function ContactItem({
  workspaceId,
  contact,
}: {
  workspaceId: string
  contact: SequenceStepContactData
}) {
  const avatarUrl = getAvatarUrl({
    avatar: contact.avatar,
    firstName: contact.firstName,
    lastName: contact.lastName,
  } as Parameters<typeof getAvatarUrl>[0])

  const fullName = getFullName({
    firstName: contact.firstName,
    lastName: contact.lastName,
    phoneNumber: contact.sourceId,
  } as Parameters<typeof getFullName>[0])

  return (
    <div className="flex items-center gap-3 rounded-lg p-0 transition-colors hover:bg-muted/50">
      <Avatar className="size-8 shrink-0">
        <AvatarImage src={avatarUrl} />
        <AvatarFallback>
          {contact.firstName?.[0]?.toUpperCase() ?? "?"}
        </AvatarFallback>
      </Avatar>

      <div className="w-32 shrink space-y-1">
        <div className="flex items-center gap-1.5">
          <Link
            className="max-w-[200px] truncate text-blue-500"
            href={`/chatbots/${workspaceId}/inbox?conversationId=${contact.conversationId}`}
            target="_blank"
          >
            <span className="truncate font-medium text-sm leading-tight">
              {fullName}
            </span>
          </Link>
          <InboxIcon channel={contact.channel} showLabel={false} size="small" />
        </div>
        {contact.occurredAt && (
          <div className="text-left text-muted-foreground text-xs">
            {new Date(contact.occurredAt).toLocaleString()}
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 items-center">
        {contact.errorContent && (
          <div className="space-y-0 whitespace-pre-wrap text-left text-destructive text-xs">
            {contact.errorContent}
          </div>
        )}
      </div>
    </div>
  )
})

function ContactItemSkeleton() {
  return (
    <div className="flex items-start gap-3 rounded-lg p-0">
      <Skeleton className="size-8 shrink-0 rounded-full" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-start justify-between gap-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-4" />
        </div>
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-3 w-20" />
      </div>
    </div>
  )
}
