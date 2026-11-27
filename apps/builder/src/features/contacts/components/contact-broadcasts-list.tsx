"use client"

import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { useDebouncedCallback } from "@chatbotx.io/ui/hooks/use-debounced-callback"
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query"
import { Loader2Icon, SendIcon } from "lucide-react"
import Link from "next/link"
import { useFormatter, useTranslations } from "next-intl"
import { useState } from "react"
import { broadcastDetailHref } from "@/features/broadcasts/lib/broadcast-links"
import { channelLabel } from "@/features/inboxes/lib/channel-label"
import { orpc } from "@/lib/orpc/query"
import {
  CONTACT_BROADCAST_SEARCH_MAX_LENGTH,
  type ContactBroadcastRecipientStatus,
  type ContactBroadcastResource,
} from "../schema/contact-broadcast"

const BROADCASTS_PER_PAGE = 20
const SEARCH_DEBOUNCE_MS = 300

type BadgeVariant = "outline" | "secondary" | "destructive"

/** How each outcome reads in the row: a failure stands out, the rest stay calm. */
const RECIPIENT_STATUS_BADGE: Record<
  ContactBroadcastRecipientStatus,
  {
    labelKey: `broadcasts.stats.${ContactBroadcastRecipientStatus}`
    variant: BadgeVariant
  }
> = {
  failed: { labelKey: "broadcasts.stats.failed", variant: "destructive" },
  clicked: { labelKey: "broadcasts.stats.clicked", variant: "secondary" },
  seen: { labelKey: "broadcasts.stats.seen", variant: "secondary" },
  delivered: { labelKey: "broadcasts.stats.delivered", variant: "outline" },
  sent: { labelKey: "broadcasts.stats.sent", variant: "outline" },
}

const BroadcastRow = ({
  broadcast,
  workspaceId,
  canOpenBroadcast,
}: {
  broadcast: ContactBroadcastResource
  workspaceId: string
  canOpenBroadcast: boolean
}) => {
  const t = useTranslations()
  const formatter = useFormatter()
  const outcome = RECIPIENT_STATUS_BADGE[broadcast.recipientStatus]

  return (
    <div className="flex items-start gap-2 rounded-md border p-2">
      <SendIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        {canOpenBroadcast ? (
          <Link
            className="block truncate font-medium hover:underline"
            href={broadcastDetailHref(workspaceId, broadcast.broadcastId)}
            title={broadcast.name}
          >
            {broadcast.name}
          </Link>
        ) : (
          <div className="truncate font-medium" title={broadcast.name}>
            {broadcast.name}
          </div>
        )}
        <div className="truncate text-muted-foreground">
          {formatter.dateTime(broadcast.scheduledAt, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <Badge variant={outcome.variant}>{t(outcome.labelKey)}</Badge>
        <Badge variant="outline">{channelLabel(broadcast.channel)}</Badge>
      </div>
    </div>
  )
}

/**
 * The broadcasts sent to the contact, newest first; read-only. Fetched only
 * once the section is opened, a page at a time, so it costs nothing for
 * contacts nobody opens. The search (part of a name, or an exact id) runs on
 * the server, so it finds a broadcast on any page; the list scrolls inside a
 * capped height so a contact with many broadcasts does not stretch the panel.
 * The name links to the broadcast only for a member who may open the
 * Broadcasts section.
 */
export const ContactBroadcastsList = ({
  workspaceId,
  contactId,
  canOpenBroadcast,
}: {
  workspaceId: string
  contactId: string
  canOpenBroadcast: boolean
}) => {
  const t = useTranslations()
  const [searchText, setSearchText] = useState("")
  const [search, setSearch] = useState("")
  const applySearch = useDebouncedCallback(setSearch, SEARCH_DEBOUNCE_MS)
  const broadcasts = useInfiniteQuery({
    ...orpc.contactsAPIs.listContactBroadcastsAuthenticatedAPI.infiniteOptions({
      input: (cursor: string | undefined) => ({
        workspaceId,
        contactId,
        perPage: BROADCASTS_PER_PAGE,
        cursor,
        search: search || undefined,
      }),
      initialPageParam: undefined,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
    }),
    // Typing keeps the rows already shown until the matching ones arrive.
    placeholderData: keepPreviousData,
  })

  const rows =
    broadcasts.data?.pages.flatMap((page) => page.data) ??
    ([] as ContactBroadcastResource[])

  const renderList = () => {
    if (broadcasts.isPending) {
      return (
        <div className="flex justify-center px-2 py-4">
          <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
        </div>
      )
    }

    // A failed next page keeps the pages already loaded; only a failed first
    // load has nothing to show.
    if (broadcasts.isError && !broadcasts.data) {
      return (
        <div className="flex items-center gap-2 text-muted-foreground">
          <span>{t("messages.errorLoadingData")}</span>
          <Button
            onClick={() => broadcasts.refetch()}
            size="sm"
            type="button"
            variant="ghost"
          >
            {t("actions.retry")}
          </Button>
        </div>
      )
    }

    if (rows.length === 0) {
      return (
        <div className="text-muted-foreground">
          {search ? t("messages.noResults") : t("contactBroadcasts.empty")}
        </div>
      )
    }

    return (
      <div className="grid grid-cols-[minmax(0,1fr)] gap-2">
        {rows.map((broadcast) => (
          <BroadcastRow
            broadcast={broadcast}
            canOpenBroadcast={canOpenBroadcast}
            key={broadcast.broadcastId}
            workspaceId={workspaceId}
          />
        ))}
        {broadcasts.isFetchNextPageError ? (
          <p className="text-destructive text-xs" role="alert">
            {t("messages.errorLoadingData")}
          </p>
        ) : null}
        {broadcasts.hasNextPage ? (
          <Button
            disabled={broadcasts.isFetchingNextPage}
            onClick={() => broadcasts.fetchNextPage()}
            size="sm"
            type="button"
            variant="ghost"
          >
            {broadcasts.isFetchingNextPage ? (
              <Loader2Icon aria-hidden="true" className="size-4 animate-spin" />
            ) : null}
            <span
              className={broadcasts.isFetchingNextPage ? "sr-only" : undefined}
            >
              {broadcasts.isFetchNextPageError
                ? t("actions.retry")
                : t("actions.loadMore")}
            </span>
          </Button>
        ) : null}
      </div>
    )
  }

  return (
    // `minmax(0, 1fr)`: the default `auto` track grows to the widest row, so a long name would push the badges out of the panel.
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2 px-2 text-sm">
      <Input
        aria-label={t("actions.search")}
        maxLength={CONTACT_BROADCAST_SEARCH_MAX_LENGTH}
        onChange={(event) => {
          setSearchText(event.target.value)
          applySearch(event.target.value.trim())
        }}
        placeholder={t("contactBroadcasts.searchPlaceholder")}
        type="search"
        value={searchText}
      />
      <div className="max-h-72 overflow-y-auto overscroll-contain">
        {renderList()}
      </div>
    </div>
  )
}
