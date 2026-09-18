"use client"

import {
  resolveWhatsappCallActivityLabelKey,
  type WhatsappCallActivityLabelKey,
} from "@chatbotx.io/sdk"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { Button, buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { ExternalLinkIcon, InfoIcon } from "lucide-react"
import Link from "next/link"
import { useFormatter, useTranslations } from "next-intl"
import { CallAudioPlayer } from "@/features/messages/components/call-audio-player"
import { formatCallDurationSeconds } from "@/features/messages/lib/format-call-duration"
import { createResolveCallRecordingUrl } from "@/features/messages/lib/resolve-call-recording-url"
import { useCallInfoSheetStore } from "@/features/messages/store/call-info-sheet-store"
import type { WhatsappCallHistoryResource } from "./schema/resource"

type CallKind = NonNullable<WhatsappCallHistoryResource["kind"]>
type TerminalCallKind = "canceled" | "declined" | "missed" | "unanswered"
/**
 * The exact input domain resolveWhatsappCallActivityLabelKey's first parameter
 * accepts (non-completed outcomes).
 */
type TerminalCallOutcome = "failed" | "rejected" | "canceled"

/**
 * Fed into resolveWhatsappCallActivityLabelKey — the same function the
 * in-conversation card uses — so a wrong mapping here mislabels the card too
 * instead of silently drifting from a duplicated hand-typed literal.
 */
const TERMINAL_KIND_RESOLVER_INPUT: Record<
  TerminalCallKind,
  {
    outcome: TerminalCallOutcome
    direction: WhatsappCallHistoryResource["direction"]
  }
> = {
  canceled: { outcome: "canceled", direction: "userInitiated" },
  declined: { outcome: "rejected", direction: "userInitiated" },
  missed: { outcome: "failed", direction: "userInitiated" },
  unanswered: { outcome: "failed", direction: "businessInitiated" },
}

/**
 * A plain literal Record, no Object.fromEntries + as cast round-trip: each
 * value is still derived by calling resolveWhatsappCallActivityLabelKey, but
 * TypeScript checks the object shape directly against Record<TerminalCallKind,
 * WhatsappCallActivityLabelKey> instead of only after an unchecked cast.
 */
const TERMINAL_KIND_LABEL_KEY: Record<
  TerminalCallKind,
  WhatsappCallActivityLabelKey
> = {
  canceled: resolveWhatsappCallActivityLabelKey(
    TERMINAL_KIND_RESOLVER_INPUT.canceled.outcome,
    TERMINAL_KIND_RESOLVER_INPUT.canceled.direction,
  ),
  declined: resolveWhatsappCallActivityLabelKey(
    TERMINAL_KIND_RESOLVER_INPUT.declined.outcome,
    TERMINAL_KIND_RESOLVER_INPUT.declined.direction,
  ),
  missed: resolveWhatsappCallActivityLabelKey(
    TERMINAL_KIND_RESOLVER_INPUT.missed.outcome,
    TERMINAL_KIND_RESOLVER_INPUT.missed.direction,
  ),
  unanswered: resolveWhatsappCallActivityLabelKey(
    TERMINAL_KIND_RESOLVER_INPUT.unanswered.outcome,
    TERMINAL_KIND_RESOLVER_INPUT.unanswered.direction,
  ),
}

/**
 * The exact key type useTranslations()'s returned t accepts, so
 * KIND_BADGE_CONFIG.labelKey below is not a bare string.
 */
type MessageKey = Parameters<ReturnType<typeof useTranslations>>[0]

/**
 * A single Record (no if-chain) driving CallKindBadge, keyed by exactly
 * CallKind so TypeScript flags a missing/extra kind. The four terminal, non-
 * completed kinds' labelKey is derived via TERMINAL_KIND_LABEL_KEY above.
 */
const KIND_BADGE_CONFIG: Record<
  CallKind,
  { variant: "secondary" | "default" | "outline"; labelKey: MessageKey }
> = {
  ongoing: {
    variant: "secondary",
    labelKey: "whatsapp.calls.page.kindOngoing",
  },
  answeredInbound: {
    variant: "default",
    labelKey: "whatsapp.calls.page.kindAnsweredInbound",
  },
  answeredOutbound: {
    variant: "default",
    labelKey: "whatsapp.calls.page.kindAnsweredOutbound",
  },
  canceled: {
    variant: "outline",
    labelKey: `messages.${TERMINAL_KIND_LABEL_KEY.canceled}`,
  },
  declined: {
    variant: "outline",
    labelKey: `messages.${TERMINAL_KIND_LABEL_KEY.declined}`,
  },
  missed: {
    variant: "outline",
    labelKey: `messages.${TERMINAL_KIND_LABEL_KEY.missed}`,
  },
  unanswered: {
    variant: "outline",
    labelKey: `messages.${TERMINAL_KIND_LABEL_KEY.unanswered}`,
  },
}

function CallKindBadge({ row }: { row: WhatsappCallHistoryResource }) {
  const t = useTranslations()
  if (!row.kind) {
    return null
  }
  const config = KIND_BADGE_CONFIG[row.kind]
  return <Badge variant={config.variant}>{t(config.labelKey)}</Badge>
}

function CallRow({
  row,
  workspaceId,
}: {
  row: WhatsappCallHistoryResource
  workspaceId: string
}) {
  const t = useTranslations("whatsapp.calls.page")
  const formatter = useFormatter()
  const openInfoSheet = useCallInfoSheetStore((state) => state.open)

  const agent =
    row.direction === "businessInitiated"
      ? row.initiatedByUser
      : row.answeredByUser

  const resolveRecordingUrl = createResolveCallRecordingUrl({
    workspaceId,
    whatsappCallId: row.id,
    context: "Whatsapp calls table",
  })

  // One href for both ways into the call's conversation: the contact cell (what
  // a reader reaches for first) and the explicit open-conversation button at
  // the end of the row.
  const conversationHref = `/space/${workspaceId}/inbox?conversationId=${row.conversationId}`

  return (
    <TableRow>
      <TableCell>
        <Link
          className="flex items-center gap-2 hover:underline"
          href={conversationHref}
        >
          <Avatar className="size-7">
            <AvatarImage src={row.contact.avatar ?? undefined} />
            <AvatarFallback>
              {(row.contact.fullName ?? "?").charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <span className="truncate">
            {row.contact.fullName ?? t("unknownContact")}
          </span>
        </Link>
      </TableCell>
      <TableCell className="text-muted-foreground">{row.inbox.name}</TableCell>
      <TableCell>
        {t(
          row.direction === "userInitiated"
            ? "directionInbound"
            : "directionOutbound",
        )}
      </TableCell>
      <TableCell>
        <CallKindBadge row={row} />
      </TableCell>
      <TableCell className="text-muted-foreground">
        {agent?.name ?? "—"}
      </TableCell>
      <TableCell className="text-muted-foreground">
        {row.durationSeconds
          ? formatCallDurationSeconds(row.durationSeconds)
          : "—"}
      </TableCell>
      <TableCell className="whitespace-nowrap text-muted-foreground">
        {formatter.dateTime(row.createdAt, {
          dateStyle: "medium",
          timeStyle: "short",
        })}
      </TableCell>
      <TableCell>
        {row.recordingPath && (
          <CallAudioPlayer
            callId={row.id}
            resolveUrl={resolveRecordingUrl}
            totalDurationSeconds={row.durationSeconds ?? undefined}
          />
        )}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          <Link
            aria-label={t("openConversation")}
            className={cn(buttonVariants({ size: "icon", variant: "ghost" }))}
            href={conversationHref}
          >
            <ExternalLinkIcon aria-hidden className="size-4" />
          </Link>
          <Button
            aria-label={t("callInformation")}
            onClick={() =>
              openInfoSheet({
                whatsappCallId: row.id,
                tab: "transcript",
                durationSeconds: row.durationSeconds ?? undefined,
              })
            }
            size="icon"
            variant="ghost"
          >
            <InfoIcon aria-hidden className="size-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

export function CallsTable({
  data,
  workspaceId,
}: {
  data: WhatsappCallHistoryResource[]
  workspaceId: string
}) {
  const t = useTranslations("whatsapp.calls.page")

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("columnContact")}</TableHead>
          <TableHead>{t("columnInbox")}</TableHead>
          <TableHead>{t("columnDirection")}</TableHead>
          <TableHead />
          <TableHead>{t("columnAgent")}</TableHead>
          <TableHead>{t("columnDuration")}</TableHead>
          <TableHead>{t("columnDate")}</TableHead>
          <TableHead />
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((row) => (
          <CallRow key={row.id} row={row} workspaceId={workspaceId} />
        ))}
      </TableBody>
    </Table>
  )
}
