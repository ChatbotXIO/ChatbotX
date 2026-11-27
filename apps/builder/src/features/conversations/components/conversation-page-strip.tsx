"use client"

import type { ChannelType } from "@chatbotx.io/database/partials"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useQuery } from "@tanstack/react-query"
import { useFormatter, useTranslations } from "next-intl"
import { useMemo } from "react"
import { useWorkspaceId } from "@/hooks/routing"
import { orpc } from "@/lib/orpc/query"
import {
  INBOX_ICON_CONFIG,
  InboxIcon,
} from "../../inboxes/components/inbox-icon"
import type { ListConversationItemResource } from "../schema/resource"

type ContactInbox = ListConversationItemResource["contactInboxes"][number]

/** Pages shown with their name on a wide header; the rest fold into "+N". */
const MAX_VISIBLE_PAGES = 3

// Same shape as the "joined the conversation" time above it ("14:31
// 27/11/2026" in vi); next-intl applies the member's own time zone.
const LAST_MESSAGE_TIME_FORMAT = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
} as const

// A page picture rarely changes: one read per set of inboxes is enough.
const AVATAR_STALE_TIME_MS = 10 * 60 * 1000

const lastMessageTime = (contactInbox: ContactInbox): number =>
  contactInbox.lastMessageAt
    ? new Date(contactInbox.lastMessageAt).getTime()
    : 0

/**
 * The page of the latest message first (that is the page the conversation is
 * on now), then the others by their last message. `latestContactInboxId`
 * comes from the conversation's latest message, which the chat store keeps
 * current on every realtime message; `contactInboxes[].lastMessageAt` is only
 * as fresh as the conversation's last fetch.
 */
const sortByLastMessage = (
  contactInboxes: readonly ContactInbox[],
  latestContactInboxId: string | undefined,
): ContactInbox[] =>
  [...contactInboxes].sort((a, b) => {
    if (a.id === latestContactInboxId) {
      return -1
    }
    if (b.id === latestContactInboxId) {
      return 1
    }
    return lastMessageTime(b) - lastMessageTime(a)
  })

/** The latest of the given times, or null when there is none. */
const latestOf = (
  times: ReadonlyArray<Date | string | null | undefined>,
): Date | null => {
  const millis = times.flatMap((time) =>
    time ? [new Date(time).getTime()] : [],
  )
  return millis.length > 0 ? new Date(Math.max(...millis)) : null
}

/**
 * The page picture, as the Posts pickers show it, with the channel's brand
 * mark in the corner like the conversation list. A channel without a page
 * picture (WhatsApp, Telegram, Zalo…) shows its brand mark instead.
 */
function PageAvatar({
  avatar,
  channel,
}: {
  avatar: string | null
  channel: ChannelType
}) {
  return (
    <span className="relative inline-flex shrink-0">
      <Avatar className="size-6">
        {avatar ? <AvatarImage alt="" src={avatar} /> : null}
        <AvatarFallback className="bg-muted">
          <InboxIcon channel={channel} showLabel={false} size="small" />
        </AvatarFallback>
      </Avatar>
      <span className="absolute -end-0.5 -bottom-0.5 rounded-full bg-background p-px">
        <InboxIcon
          channel={channel}
          iconClassName="size-2.5"
          showLabel={false}
          size="small"
        />
      </span>
    </span>
  )
}

function PageChip({
  avatar,
  contactInbox,
  isCurrent,
}: {
  avatar: string | null
  contactInbox: ContactInbox
  isCurrent: boolean
}) {
  const t = useTranslations()
  const channel = contactInbox.channel as ChannelType
  const { defaultLabelKey } =
    INBOX_ICON_CONFIG[channel] ?? INBOX_ICON_CONFIG.omnichannel
  return (
    <span
      className={cn(
        "flex min-w-0 max-w-52 shrink-0 items-center gap-1.5 rounded-full border border-transparent py-0.5 ps-0.5 pe-2.5",
        isCurrent && "border-border bg-background shadow-xs",
      )}
    >
      <PageAvatar avatar={avatar} channel={channel} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-[0.6875rem] text-muted-foreground">
          {t(defaultLabelKey)}
        </span>
        <span className="truncate font-medium text-xs">
          {contactInbox.inbox.name}
        </span>
      </span>
    </span>
  )
}

function MorePages({
  className,
  contactInboxes,
}: {
  className?: string
  contactInboxes: readonly ContactInbox[]
}) {
  const t = useTranslations("conversationPages")
  if (contactInboxes.length === 0) {
    return null
  }
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            className={cn(
              "shrink-0 rounded-full border border-dashed px-2.5 py-0.5 font-medium text-muted-foreground text-xs",
              className,
            )}
          >
            {t("morePages", { count: contactInboxes.length })}
          </span>
        }
      />
      <TooltipContent align="center" side="bottom">
        {contactInboxes
          .map((contactInbox) => contactInbox.inbox.name)
          .join(", ")}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * The strip under the inbox conversation header: every page (inbox) the
 * contact talks to, the one with the latest message first and highlighted,
 * then the time of the last message. On a narrow column only that first
 * page keeps its chip; the others fold into "+N".
 */
export function ConversationPageStrip({
  conversation,
}: {
  conversation: ListConversationItemResource
}) {
  const t = useTranslations("conversationPages")
  const format = useFormatter()
  const workspaceId = useWorkspaceId()
  const latestMessage = conversation.messages?.[0]
  const pages = useMemo(
    () =>
      sortByLastMessage(
        conversation.contactInboxes ?? [],
        latestMessage?.contactInboxId,
      ),
    [conversation.contactInboxes, latestMessage?.contactInboxId],
  )
  const inboxIds = useMemo(
    () => [...new Set(pages.map((page) => page.inboxId))].sort(),
    [pages],
  )
  const avatars = useQuery({
    ...orpc.inboxesAPI.listInboxAvatarsAuthenticatedAPI.queryOptions({
      input: { inboxIds, workspaceId },
    }),
    enabled: inboxIds.length > 0,
    staleTime: AVATAR_STALE_TIME_MS,
  })
  const avatarByInbox = useMemo(
    () =>
      new Map(
        (avatars.data?.data ?? []).map((entry) => [
          entry.inboxId,
          entry.avatar,
        ]),
      ),
    [avatars.data],
  )

  const [current] = pages
  if (!current) {
    return null
  }
  // The latest message is updated live; the contact inbox times cover a
  // conversation whose latest message is not loaded.
  const lastMessageAt = latestOf([
    latestMessage?.createdAt,
    ...pages.map((page) => page.lastMessageAt),
  ])
  const shownWide = pages.slice(0, MAX_VISIBLE_PAGES)

  return (
    // Same surface as the header above it: only a hairline separates them,
    // so the header, strip and the banner below do not stack three greys.
    <div className="@container/page-strip flex min-w-0 items-center gap-3 border-border/60 border-t ps-2.5 pe-4 pt-1 pb-1.5">
      <section
        aria-label={t("label")}
        className="flex min-w-0 items-center gap-1 overflow-hidden"
      >
        {shownWide.map((page, index) => (
          <span
            className={cn(
              "min-w-0",
              index > 0 && "@max-lg/page-strip:hidden",
              index === 0 ? "flex" : "flex shrink-0",
            )}
            key={page.id}
          >
            <PageChip
              avatar={avatarByInbox.get(page.inboxId) ?? null}
              contactInbox={page}
              isCurrent={pages.length > 1 && index === 0}
            />
          </span>
        ))}
        <MorePages
          className="@lg/page-strip:hidden"
          contactInboxes={pages.slice(1)}
        />
        <MorePages
          className="@max-lg/page-strip:hidden"
          contactInboxes={pages.slice(MAX_VISIBLE_PAGES)}
        />
      </section>
      {lastMessageAt && (
        <div className="ms-auto flex shrink-0 flex-col items-end text-end leading-tight">
          <span className="@max-lg/page-strip:hidden text-[0.6875rem] text-muted-foreground">
            {t("lastMessage")}
          </span>
          <time className="text-xs" dateTime={lastMessageAt.toISOString()}>
            {format.dateTime(lastMessageAt, LAST_MESSAGE_TIME_FORMAT)}
          </time>
        </div>
      )}
    </div>
  )
}
