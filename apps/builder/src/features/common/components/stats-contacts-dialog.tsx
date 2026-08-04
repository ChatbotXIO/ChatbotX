"use client"

import type { ChannelType } from "@chatbotx.io/database/partials"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@chatbotx.io/ui/components/ui/dialog"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { TagsInputField } from "@chatbotx.io/ui/components/ui/muhammada86/tags-input-field"
import { ScrollArea } from "@chatbotx.io/ui/components/ui/scroll-area"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import { zodResolver } from "@hookform/resolvers/zod"
import { Loader2Icon, TagIcon } from "lucide-react"
import Link from "next/link"
import { useFormatter, useTranslations } from "next-intl"
import { memo, useCallback, useEffect, useRef, useState } from "react"
import { useForm } from "react-hook-form"
import { toast } from "sonner"
import { z } from "zod"
import { useAvatarUrl } from "@/features/contacts/utils"
import { InboxIcon } from "@/features/inboxes/components/inbox-icon"
import { useTagOptions } from "@/features/tags/provider/tag-hook"
import {
  TagStoreProvider,
  useTagStore,
} from "@/features/tags/provider/tag-store-context"
import {
  type StatsSelection,
  useStatsSelection,
} from "../hooks/use-stats-selection"
import { formatErrorContent } from "../lib/format-error-content"

const perPage = 20
const scrollThreshold = 200

const tagFormSchema = z.object({
  tags: z.array(z.string().trim().min(1)).min(1),
})

type TagFormValues = z.infer<typeof tagFormSchema>

export type StatsContactRow = {
  contactId: string
  contactInboxId: string
  firstName: string | null
  lastName: string | null
  fullName: string | null
  avatar: string | null
  channel: ChannelType
  conversationId: string | null
  errorContent?: string | null
  occurredAt?: string | null
}

type StatsContactsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  workspaceId: string
  title: string
  total: number
  i18nNamespace: "broadcasts" | "sequences"
  showErrors?: boolean
  fetchPage: (page: number, perPage: number) => Promise<StatsContactRow[]>
  onManualTag?: (contactIds: string[], tags: string[]) => Promise<void>
  onBulkTag?: (excludedContactIds: string[], tags: string[]) => Promise<void>
}

export const StatsContactsDialog = memo(function StatsContactsDialog(
  props: StatsContactsDialogProps,
) {
  const canTag = Boolean(props.onManualTag && props.onBulkTag)
  const dialog = <StatsContactsDialogInner {...props} />

  return canTag ? (
    // Only fetch tags once the dialog is actually opened. These dialogs are
    // rendered per stats cell (many per table) and stay mounted while closed,
    // so eager initialization fired one /tags request per closed dialog.
    <TagStoreProvider
      autoInitialize={props.open}
      workspaceId={props.workspaceId}
    >
      {dialog}
    </TagStoreProvider>
  ) : (
    dialog
  )
})

const StatsContactsDialogInner = memo(function StatsContactsDialogInner({
  open,
  onOpenChange,
  workspaceId,
  title,
  total,
  i18nNamespace,
  showErrors = false,
  fetchPage,
  onManualTag,
  onBulkTag,
}: StatsContactsDialogProps) {
  const t = useTranslations()
  const formatter = useFormatter()
  const scrollRootRef = useRef<HTMLDivElement>(null)
  const [contacts, setContacts] = useState<StatsContactRow[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const [isLoading, setIsLoading] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)
  const [tagDialogOpen, setTagDialogOpen] = useState(false)
  const loadInFlightRef = useRef(false)
  const selectionState = useStatsSelection(total)
  const canTag = Boolean(onManualTag && onBulkTag)
  const hasSelectedAll =
    selectionState.selection.mode === "all" &&
    selectionState.selection.excludedIds.size === 0

  const appendContacts = useCallback((rows: StatsContactRow[]) => {
    setContacts((current) => {
      const seenContactIds = new Set(
        current.map((contact) => contact.contactId),
      )
      const nextRows = rows.filter((row) => {
        if (seenContactIds.has(row.contactId)) {
          return false
        }
        seenContactIds.add(row.contactId)
        return true
      })
      return [...current, ...nextRows]
    })
  }, [])

  const loadPage = useCallback(
    async (nextPage: number, replace: boolean) => {
      if (!open || loadInFlightRef.current) {
        return
      }

      loadInFlightRef.current = true
      if (replace) {
        setIsLoading(true)
      } else {
        setIsLoadingMore(true)
      }

      try {
        const rows = await fetchPage(nextPage, perPage)
        if (replace) {
          setContacts(rows)
        } else {
          appendContacts(rows)
        }
        setPage(nextPage)
        setHasMore(rows.length === perPage)
      } catch (error) {
        console.error("Failed to fetch stat contacts:", error)
      } finally {
        loadInFlightRef.current = false
        setIsLoading(false)
        setIsLoadingMore(false)
      }
    },
    [appendContacts, fetchPage, open],
  )

  useEffect(() => {
    if (!open) {
      return
    }

    setContacts([])
    setPage(1)
    setHasMore(true)
    selectionState.reset()
    loadPage(1, true).catch((error) => {
      console.error("Failed to fetch stat contacts:", error)
    })
  }, [loadPage, open, selectionState.reset])

  useEffect(() => {
    if (!open) {
      return
    }

    const root = scrollRootRef.current
    const viewport = root?.querySelector<HTMLElement>(
      '[data-slot="scroll-area-viewport"]',
    )
    if (!viewport) {
      return
    }

    const handleScroll = () => {
      const nearBottom =
        viewport.scrollTop + viewport.clientHeight >=
        viewport.scrollHeight - scrollThreshold

      if (nearBottom && hasMore && !isLoading && !isLoadingMore) {
        loadPage(page + 1, false).catch((error) => {
          console.error("Failed to fetch stat contacts:", error)
        })
      }
    }

    viewport.addEventListener("scroll", handleScroll)
    return () => viewport.removeEventListener("scroll", handleScroll)
  }, [hasMore, isLoading, isLoadingMore, loadPage, open, page])

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex max-h-screen flex-col sm:max-w-2xl">
        <DialogHeader className="mb-2">
          <DialogTitle>
            {title} ({formatter.number(total)})
          </DialogTitle>
        </DialogHeader>

        {canTag && (
          <div className="flex items-center justify-between gap-3 border-y py-2">
            <div className="flex min-w-0 items-center gap-2">
              <Checkbox
                aria-label={t("actions.selectAll")}
                checked={selectionState.headerState.checked}
                indeterminate={selectionState.headerState.indeterminate}
                onCheckedChange={selectionState.toggleHeader}
              />
              <span className="truncate text-muted-foreground text-sm">
                {hasSelectedAll
                  ? t(`${i18nNamespace}.stats.selectedAll`)
                  : t(`${i18nNamespace}.stats.selectedCount`, {
                      count: selectionState.selectedCount,
                    })}
              </span>
            </div>
            <Button
              disabled={selectionState.selectedCount === 0}
              onClick={() => setTagDialogOpen(true)}
              size="sm"
              type="button"
            >
              <TagIcon className="size-4" />
              {t("actions.addTag")}
            </Button>
          </div>
        )}

        <div ref={scrollRootRef} style={{ height: "min(520px, 60vh)" }}>
          <ScrollArea className="h-full">
            {isLoading && (
              <div className="space-y-2 pe-4">
                <ContactItemSkeleton />
                <ContactItemSkeleton />
                <ContactItemSkeleton />
                <ContactItemSkeleton />
                <ContactItemSkeleton />
              </div>
            )}
            {!isLoading && contacts.length === 0 && (
              <div className="py-8 text-center text-muted-foreground text-sm">
                {t(`${i18nNamespace}.stats.noContacts`)}
              </div>
            )}
            {!isLoading && contacts.length > 0 && (
              <div className="space-y-2 pe-4">
                {contacts.map((contact) => (
                  <SelectableContactItem
                    canTag={canTag}
                    contact={contact}
                    isSelected={selectionState.isSelected(contact.contactId)}
                    key={contact.contactId}
                    onToggle={() =>
                      selectionState.toggleContact(contact.contactId)
                    }
                    showErrors={showErrors}
                    workspaceId={workspaceId}
                  />
                ))}
                {isLoadingMore && (
                  <div className="py-2 text-center text-muted-foreground text-sm">
                    {t(`${i18nNamespace}.stats.loadingMore`)}
                  </div>
                )}
              </div>
            )}
          </ScrollArea>
        </div>

        {canTag && onManualTag && onBulkTag && (
          <StatsTagDialog
            i18nNamespace={i18nNamespace}
            onBulkTag={onBulkTag}
            onManualTag={onManualTag}
            onOpenChange={setTagDialogOpen}
            open={tagDialogOpen}
            selectedCount={selectionState.selectedCount}
            selection={selectionState.selection}
          />
        )}
      </DialogContent>
    </Dialog>
  )
})

const StatsTagDialog = memo(function StatsTagDialog({
  open,
  onOpenChange,
  i18nNamespace,
  selectedCount,
  selection,
  onManualTag,
  onBulkTag,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  i18nNamespace: "broadcasts" | "sequences"
  selectedCount: number
  selection: StatsSelection
  onManualTag: (contactIds: string[], tags: string[]) => Promise<void>
  onBulkTag: (excludedContactIds: string[], tags: string[]) => Promise<void>
}) {
  const t = useTranslations()
  const hasSelectedAll =
    selection.mode === "all" && selection.excludedIds.size === 0
  const tagOptions = useTagOptions()
  const { getAllActiveTags } = useTagStore((state) => state)
  const form = useForm<TagFormValues>({
    resolver: zodResolver(tagFormSchema),
    mode: "onChange",
    defaultValues: { tags: [] },
  })

  const onSubmit = form.handleSubmit(async ({ tags }) => {
    try {
      if (selection.mode === "manual") {
        await onManualTag([...selection.includedIds], tags)
        toast.success(
          t("messages.updatedSuccess", {
            feature: t("fields.contact.label"),
          }),
        )
      } else {
        await onBulkTag([...selection.excludedIds], tags)
        toast.success(
          t(`${i18nNamespace}.stats.tagQueued`, {
            count: selectedCount,
          }),
        )
      }

      await getAllActiveTags()
      form.reset({ tags: [] })
      onOpenChange(false)
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("messages.unknownError"),
      )
    }
  })

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="flex max-h-screen max-w-xl flex-col">
        <DialogHeader>
          <DialogTitle>
            {t("messages.addFeature", { feature: t("fields.tag.label") })}
          </DialogTitle>
          <DialogDescription>
            {hasSelectedAll
              ? t(`${i18nNamespace}.stats.tagAllDialogDescription`)
              : t(`${i18nNamespace}.stats.tagDialogDescription`, {
                  count: selectedCount,
                })}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form className="flex flex-1 flex-col space-y-4" onSubmit={onSubmit}>
            <TagsInputField
              addAnotherPlaceholder={t("actions.addAnother")}
              label={t("fields.tag.label")}
              name="tags"
              placeholder={t("actions.enterFieldAndPressEnter", {
                field: t("fields.tag.label").toLowerCase(),
              })}
              suggestions={tagOptions}
            />

            <DialogFooter>
              <DialogClose
                render={
                  <Button size="sm" variant="ghost">
                    {t("actions.cancel")}
                  </Button>
                }
              />

              <Button
                disabled={
                  !form.formState.isValid || form.formState.isSubmitting
                }
                size="sm"
                type="submit"
              >
                {form.formState.isSubmitting && (
                  <Loader2Icon className="size-4 animate-spin" />
                )}
                {t("actions.confirm")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
})

const SelectableContactItem = memo(function SelectableContactItem({
  workspaceId,
  contact,
  isSelected,
  canTag,
  showErrors,
  onToggle,
}: {
  workspaceId: string
  contact: StatsContactRow
  isSelected: boolean
  canTag: boolean
  showErrors: boolean
  onToggle: () => void
}) {
  const avatarUrl = useAvatarUrl({
    avatar: contact.avatar,
    firstName: contact.firstName,
    lastName: contact.lastName,
  } as Parameters<typeof useAvatarUrl>[0])

  return (
    <div className="flex items-center gap-3 rounded-lg p-0 transition-colors hover:bg-muted/50">
      {canTag && (
        <Checkbox
          aria-label={contact.fullName ?? contact.contactId}
          checked={isSelected}
          onCheckedChange={onToggle}
        />
      )}

      <Avatar className="size-8 shrink-0">
        <AvatarImage src={avatarUrl} />
        <AvatarFallback>
          {contact.firstName?.[0]?.toUpperCase() ?? "?"}
        </AvatarFallback>
      </Avatar>

      <div className="w-32 shrink space-y-1">
        <div className="flex items-center gap-1.5">
          {contact.conversationId ? (
            <Link
              className="max-w-[200px] truncate text-blue-500"
              href={`/space/${workspaceId}/inbox?conversationId=${contact.conversationId}`}
              target="_blank"
            >
              <span className="truncate font-medium text-sm leading-tight">
                {contact.fullName}
              </span>
            </Link>
          ) : (
            <span className="truncate font-medium text-sm leading-tight">
              {contact.fullName}
            </span>
          )}
          <InboxIcon
            channel={contact.channel || ""}
            showLabel={false}
            size="small"
          />
        </div>
        {contact.occurredAt && (
          <div className="text-start text-muted-foreground text-xs">
            {new Date(contact.occurredAt).toLocaleString()}
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 items-center justify-center self-center">
        {showErrors && contact.errorContent && (
          <div
            className="space-y-0 whitespace-pre-wrap text-start text-destructive text-xs"
            style={{ overflowWrap: "anywhere" }}
          >
            {formatErrorContent(contact.errorContent)}
          </div>
        )}
      </div>
    </div>
  )
})

function ContactItemSkeleton() {
  return (
    <div className="flex items-start gap-3 rounded-lg p-0">
      <Skeleton className="size-4 shrink-0" />
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
