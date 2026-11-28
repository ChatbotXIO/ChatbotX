"use client"

import type {
  CommentAutomationType,
  ContactTouchpointKind,
} from "@chatbotx.io/database/partials"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { useInfiniteQuery } from "@tanstack/react-query"
import {
  ClipboardListIcon,
  Loader2Icon,
  type LucideIcon,
  MessageCircleIcon,
  MessageSquareTextIcon,
} from "lucide-react"
import Link from "next/link"
import { useFormatter, useTranslations } from "next-intl"
import { channelLabel } from "@/features/inboxes/lib/channel-label"
import { TOOLS_CONFIG } from "@/features/tools/tools-list"
import { dedupeBy } from "@/lib/dedupe-by"
import { orpc } from "@/lib/orpc/query"
import { toHttpUrl } from "../lib/http-url"
import type { ContactTouchpointResource } from "../schema/touchpoint"
import { SectionQueryState } from "./section-query-state"

const TOUCHPOINTS_PER_PAGE = 20

type ToolConfig = (typeof TOOLS_CONFIG)[number]
type ToolId = ToolConfig["id"]
type Translate = ReturnType<typeof useTranslations>

/** The Tools card that owns each kind; the inbox source and post comment have no tool. */
const TOOL_ID_OF_KIND: Partial<Record<ContactTouchpointKind, ToolId>> = {
  minigame: "minigames",
  leaderboard: "leaderboards",
  questionnaire: "questionnaires",
  miniApp: "mini-apps",
  poll: "poll-manager",
  leadForm: "facebook-lead-ads",
  inboundWebhook: "inbound-webhooks",
  magicLink: "magic-links",
}

const TOOL_ID_OF_COMMENT_AUTOMATION: Record<CommentAutomationType, ToolId> = {
  messenger: "facebook-comment",
  instagram: "instagram-comment",
  instagramFacebook: "instagram-comment",
  threads: "threads-comment",
  tiktok: "tiktok-comment",
}

const toolIdOf = (item: ContactTouchpointResource): ToolId | undefined => {
  if (item.kind === "commentAutomation") {
    return TOOL_ID_OF_COMMENT_AUTOMATION[item.details.automationType]
  }
  if (item.kind === "refLink") {
    return item.details.linkType === "qrCode" ? "qr-code" : "reflinks"
  }
  return TOOL_ID_OF_KIND[item.kind]
}

const toolConfigOf = (toolId: ToolId | undefined): ToolConfig | undefined =>
  TOOLS_CONFIG.find((config) => config.id === toolId)

/** Kinds that are not a tool: their own icon and label. */
const OWN_ICON_OF_KIND: Partial<Record<ContactTouchpointKind, LucideIcon>> = {
  inboxSource: MessageCircleIcon,
  postComment: MessageSquareTextIcon,
  form: ClipboardListIcon,
}

/** One short line per fact the row's kind reports; the switch narrows `item.details` per kind. */
const formatDetails = (
  item: ContactTouchpointResource,
  t: Translate,
): string[] => {
  switch (item.kind) {
    case "inboxSource":
    case "postComment":
    case "form":
      return []
    case "minigame":
      return [
        t("contactTouchpoints.details.played", { count: item.details.played }),
        ...(item.details.lastPrizeName
          ? [
              t("contactTouchpoints.details.lastPrize", {
                prize: item.details.lastPrizeName,
              }),
            ]
          : []),
      ]
    case "leaderboard":
      return [
        t("contactTouchpoints.details.score", { score: item.details.score }),
      ]
    case "questionnaire":
      return [
        item.details.status === "completed"
          ? t("contactTouchpoints.details.completed")
          : t("contactTouchpoints.details.inProgress"),
        t("contactTouchpoints.details.submissions", {
          count: item.details.submissions,
        }),
      ]
    case "miniApp":
      return [
        t("contactTouchpoints.details.submissions", {
          count: item.details.submissions,
        }),
      ]
    case "poll":
      return item.details.candidateName
        ? [
            t("contactTouchpoints.details.pollChoice", {
              name: item.details.candidateName,
            }),
          ]
        : []
    case "leadForm":
      return [
        t("contactTouchpoints.details.leads", { count: item.details.leads }),
      ]
    case "inboundWebhook":
      return [
        t("contactTouchpoints.details.requests", {
          count: item.details.requests,
        }),
      ]
    case "commentAutomation":
      return [
        t("contactTouchpoints.details.replies", {
          count: item.details.replies,
        }),
      ]
    case "refLink":
      return [
        t("contactTouchpoints.details.visits", { count: item.details.visits }),
      ]
    case "magicLink":
      return [
        t("contactTouchpoints.details.clicks", { count: item.details.clicks }),
      ]
    default:
      return item satisfies never
  }
}

/** Why the row is in the list: the tool's title, or the source the conversation started from. */
const kindLabel = (
  item: ContactTouchpointResource,
  tool: ToolConfig | undefined,
  t: Translate,
): string => {
  if (tool) {
    return t(tool.labelKey)
  }
  if (item.kind === "inboxSource") {
    const key = `condition.sources.${item.details.source}` as const
    return t.has(key) ? t(key) : item.details.source
  }
  if (item.kind === "postComment") {
    return t("contactTouchpoints.kinds.postComment")
  }
  return t("contactTouchpoints.kinds.form")
}

const rowKey = (item: ContactTouchpointResource): string =>
  `${item.kind}:${item.resourceKey}`

/**
 * A live feed can show a row on two pages when it moves between two fetches;
 * the first copy (the earlier page, so the newer position) wins.
 */
export const dedupeByRowKey = (
  items: ContactTouchpointResource[],
): ContactTouchpointResource[] => dedupeBy(items, rowKey)

const TouchpointRow = ({
  item,
  workspaceId,
}: {
  item: ContactTouchpointResource
  workspaceId: string
}) => {
  const t = useTranslations()
  const formatter = useFormatter()
  const tool = toolConfigOf(toolIdOf(item))
  const Icon = tool?.icon ?? OWN_ICON_OF_KIND[item.kind] ?? MessageCircleIcon
  const label = kindLabel(item, tool, t)
  const details = formatDetails(item, t)
  const toolHref = tool?.getLink(workspaceId)
  const postHref =
    item.kind === "postComment" ? toHttpUrl(item.details.permalink) : null

  const content = (
    <>
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-muted-foreground text-xs">{label}</div>
        {item.resourceName ? (
          <div
            className="truncate font-medium"
            data-testid="touchpoint-resource-name"
            title={item.resourceName}
          >
            {item.resourceName}
          </div>
        ) : null}
        {details.length > 0 ? (
          <div className="truncate text-muted-foreground">
            {details.join(" · ")}
          </div>
        ) : null}
        <div className="truncate text-muted-foreground">
          {formatter.dateTime(item.occurredAt, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </div>
      </div>
      {item.channel ? (
        <Badge className="shrink-0" variant="outline">
          {channelLabel(item.channel)}
        </Badge>
      ) : null}
    </>
  )
  const className =
    "flex min-w-0 items-start gap-2 rounded-md border p-2 transition-colors hover:bg-muted"

  if (toolHref) {
    return (
      <Link className={className} href={toolHref}>
        {content}
      </Link>
    )
  }
  if (postHref) {
    return (
      <a
        className={className}
        href={postHref}
        rel="noopener noreferrer"
        target="_blank"
      >
        {content}
      </a>
    )
  }
  return (
    <div className="flex min-w-0 items-start gap-2 rounded-md border p-2">
      {content}
    </div>
  )
}

/**
 * Where the contact came in and which tools they took part in, newest first.
 * Fetched only once the section is opened, a page at a time. A live view: the
 * list dedupes by `(kind, resourceKey)` and a refetch starts from page 1.
 */
export const ContactTouchpointsList = ({
  workspaceId,
  contactId,
}: {
  workspaceId: string
  contactId: string
}) => {
  const t = useTranslations()
  const touchpoints = useInfiniteQuery(
    orpc.contactsAPIs.listContactTouchpointsAuthenticatedAPI.infiniteOptions({
      input: (cursor: string | undefined) => ({
        workspaceId,
        contactId,
        perPage: TOUCHPOINTS_PER_PAGE,
        cursor,
      }),
      initialPageParam: undefined,
      getNextPageParam: (page) => page.nextCursor ?? undefined,
    }),
  )

  // A failed next page keeps the pages already loaded; only a first load has
  // nothing to show.
  if (touchpoints.isPending || (touchpoints.isError && !touchpoints.data)) {
    return (
      <SectionQueryState
        isError={touchpoints.isError}
        isFetching={touchpoints.isFetching}
        isPending={touchpoints.isPending}
        onRetry={() => touchpoints.refetch()}
      />
    )
  }

  const rows = dedupeByRowKey(
    touchpoints.data.pages.flatMap((page) => page.data),
  )
  if (rows.length === 0) {
    return (
      <div className="px-2 text-muted-foreground text-sm">
        {t("contactTouchpoints.empty")}
      </div>
    )
  }

  return (
    // `minmax(0, 1fr)`: the default `auto` track grows to a long unbroken name and widens the panel.
    <div className="grid grid-cols-[minmax(0,1fr)] gap-2 px-2 text-sm">
      {rows.map((item) => (
        <TouchpointRow
          item={item}
          key={rowKey(item)}
          workspaceId={workspaceId}
        />
      ))}
      {touchpoints.isFetchNextPageError ? (
        <p className="text-destructive text-xs" role="alert">
          {t("messages.errorLoadingData")}
        </p>
      ) : null}
      {touchpoints.hasNextPage ? (
        <Button
          disabled={touchpoints.isFetchingNextPage}
          onClick={() => touchpoints.fetchNextPage()}
          size="sm"
          type="button"
          variant="ghost"
        >
          {touchpoints.isFetchingNextPage ? (
            <Loader2Icon aria-hidden="true" className="size-4 animate-spin" />
          ) : null}
          <span
            className={touchpoints.isFetchingNextPage ? "sr-only" : undefined}
          >
            {touchpoints.isFetchNextPageError
              ? t("actions.retry")
              : t("actions.loadMore")}
          </span>
        </Button>
      ) : null}
    </div>
  )
}
