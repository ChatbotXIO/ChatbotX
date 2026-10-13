"use client"

import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@chatbotx.io/ui/components/ui/tabs"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import { formatDate } from "@chatbotx.io/ui/lib/format"
import { cn } from "@chatbotx.io/ui/lib/utils"
import type { ColumnDef } from "@tanstack/react-table"
import { DownloadIcon, Loader, ScrollTextIcon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { parseAsInteger, parseAsStringLiteral, useQueryStates } from "nuqs"
import { use, useMemo, useState } from "react"
import { toast } from "sonner"
import { useAvatarUrl } from "@/features/contacts/utils"
import { findParticipantConversationAction } from "../../actions/find-participant-conversation.action"
import { breakdownEntries } from "../../lib/format"
import { LEADERBOARD_BREAKDOWN_KEY } from "../../lib/platforms"
import { LEADERBOARD_PARTICIPANT_FILTERS } from "../../lib/search-params"
import type {
  LeaderboardRow,
  ListLeaderboardParticipantsResult,
} from "../../queries"
import { LeaderboardPlatformLabel } from "../leaderboard-platform-label"
import { LeaderboardStatusBadge } from "../leaderboard-status-badge"
import { ExportLeaderboardDialog } from "../list/export-leaderboard-dialog"
import { AuditLogDialog } from "./audit-log-dialog"
import { LeaderboardSwitcher } from "./leaderboard-switcher"
import { ParticipantRowMenu } from "./participant-row-menu"

type ParticipantRow = ListLeaderboardParticipantsResult["data"][number]

const FILTER_LABEL_KEY = {
  all: "leaderboards.participants.filters.all",
  top10: "leaderboards.participants.filters.top10",
  top50: "leaderboards.participants.filters.top50",
  banned: "leaderboards.participants.filters.banned",
} as const

const MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" }

function RankCell({
  rank,
  isBanned,
}: {
  rank: number | null
  isBanned: boolean
}) {
  if (isBanned) {
    return <span aria-hidden="true">🚫</span>
  }
  if (rank === null) {
    return <span className="text-muted-foreground">—</span>
  }
  return (
    <span className={cn("font-semibold", MEDALS[rank] && "text-lg")}>
      {MEDALS[rank] ?? `#${rank}`}
    </span>
  )
}

/** Click opens the participant's conversation in the inbox (new tab), like the minigame play history. */
function ParticipantCell({
  row,
  workspaceId,
}: {
  row: ParticipantRow
  workspaceId: string
}) {
  const t = useTranslations()
  const avatarUrl = useAvatarUrl({ avatar: row.avatar })
  const name = row.fullName ?? t("leaderboards.participants.unknown")
  // Already masked server-side (`maskParticipantPhone`).
  const phone = row.phoneNumber
  const boundFindConversationAction = useMemo(
    () => findParticipantConversationAction.bind(null, workspaceId),
    [workspaceId],
  )
  const { execute, isExecuting } = useAction(boundFindConversationAction, {
    onSuccess: ({ data }) => {
      if (!data?.conversationId) {
        toast.info(t("leaderboards.participants.conversationNotFound"))
        return
      }
      const opened = window.open(
        `/space/${workspaceId}/inbox?conversationId=${data.conversationId}`,
        `leaderboard-conversation-${row.contactId}`,
      )
      if (!opened) {
        toast.error(t("leaderboards.participants.popupBlocked"))
      }
    },
    onError: () => {
      toast.error(t("messages.unknownError"))
    },
  })
  return (
    <Button
      className="h-auto max-w-full justify-start gap-2 px-2 py-1"
      disabled={isExecuting}
      onClick={() => execute({ contactId: row.contactId })}
      variant="ghost"
    >
      <Avatar className="size-8">
        <AvatarImage alt={name} className="object-cover" src={avatarUrl} />
        <AvatarFallback>{name.slice(0, 2)}</AvatarFallback>
      </Avatar>
      <div className="flex min-w-0 flex-col items-start">
        <span className="truncate font-medium">{name}</span>
        <span className="truncate font-normal text-muted-foreground text-xs">
          {t("leaderboards.participants.contactId", { id: row.contactId })}
          {phone ? ` · ${phone}` : ""}
        </span>
      </div>
      {isExecuting ? (
        <Loader aria-hidden="true" className="size-4 shrink-0 animate-spin" />
      ) : null}
    </Button>
  )
}

function BreakdownCell({ breakdown }: { breakdown: Record<string, number> }) {
  const t = useTranslations()
  const parts = breakdownEntries(breakdown).flatMap(([key, count]) =>
    key in LEADERBOARD_BREAKDOWN_KEY
      ? [t(LEADERBOARD_BREAKDOWN_KEY[key], { count })]
      : [],
  )
  return (
    <span className="text-muted-foreground text-xs">
      {parts.length > 0 ? parts.join(" • ") : "—"}
    </span>
  )
}

export function ParticipantsView({
  workspaceId,
  leaderboard,
  promises,
}: {
  workspaceId: string
  leaderboard: LeaderboardRow
  promises: Promise<[ListLeaderboardParticipantsResult]>
}) {
  const t = useTranslations()
  const locale = useLocale()
  const [{ data, pageCount }] = use(promises)
  const [dialog, setDialog] = useState<"export" | "audit" | null>(null)
  const [{ filter }, setQuery] = useQueryStates(
    {
      filter: parseAsStringLiteral(LEADERBOARD_PARTICIPANT_FILTERS).withDefault(
        "all",
      ),
      page: parseAsInteger.withDefault(1),
    },
    { shallow: false, clearOnDefault: true },
  )
  const editable =
    leaderboard.status === "active" || leaderboard.status === "paused"
  const canExport = leaderboard.availableActions.includes("export")

  const columns = useMemo<ColumnDef<ParticipantRow>[]>(
    () => [
      {
        id: "rank",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("leaderboards.participants.columns.rank")}
          />
        ),
        cell: ({ row }) => (
          <RankCell isBanned={row.original.isBanned} rank={row.original.rank} />
        ),
        size: 40,
        enableSorting: false,
      },
      {
        id: "participant",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("leaderboards.participants.columns.participant")}
          />
        ),
        cell: ({ row }) => (
          <ParticipantCell row={row.original} workspaceId={workspaceId} />
        ),
        meta: {
          label: t("leaderboards.participants.columns.participant"),
          placeholder: t("leaderboards.participants.searchPlaceholder"),
          variant: "text",
        },
        enableColumnFilter: true,
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "channel",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.channel.label")}
          />
        ),
        cell: () => (
          <LeaderboardPlatformLabel platform={leaderboard.platform} />
        ),
        enableSorting: false,
      },
      {
        id: "score",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("leaderboards.participants.columns.score")}
          />
        ),
        cell: ({ row }) => (
          <span
            className={cn(
              "font-semibold",
              row.original.isBanned && "text-muted-foreground line-through",
            )}
          >
            {row.original.score.toLocaleString()}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: "breakdown",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("leaderboards.participants.columns.breakdown")}
          />
        ),
        cell: ({ row }) => <BreakdownCell breakdown={row.original.breakdown} />,
        enableSorting: false,
      },
      {
        id: "lastActivity",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("leaderboards.participants.columns.lastActivity")}
          />
        ),
        cell: ({ row }) => (
          <span className="whitespace-nowrap text-sm">
            {formatDate(row.original.lastActivityAt, {
              locale,
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        ),
        enableSorting: false,
      },
      {
        id: "action",
        size: 10,
        header: () => null,
        cell: ({ row }) => (
          <ParticipantRowMenu
            contactId={row.original.contactId}
            editable={editable}
            isBanned={row.original.isBanned}
            leaderboardId={leaderboard.id}
            participantName={
              row.original.fullName ?? t("leaderboards.participants.unknown")
            }
            workspaceId={workspaceId}
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [t, locale, editable, leaderboard.id, leaderboard.platform, workspaceId],
  )

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    initialState: { columnPinning: { right: ["action"] } },
    getRowId: (row) => row.contactId,
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-bold text-xl">
            {t("leaderboards.participants.title")}
          </h1>
          <LeaderboardSwitcher
            currentName={leaderboard.name}
            leaderboardId={leaderboard.id}
            workspaceId={workspaceId}
          />
          <LeaderboardStatusBadge status={leaderboard.status} />
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setDialog("audit")}
            size="sm"
            variant="outline"
          >
            <ScrollTextIcon />
            {t("leaderboards.auditLog.title")}
          </Button>
          {canExport ? (
            <Button onClick={() => setDialog("export")} size="sm">
              <DownloadIcon />
              {t("actions.export")}
            </Button>
          ) : null}
        </div>
      </div>
      {editable ? null : (
        <p className="rounded-md bg-muted px-3 py-2 text-muted-foreground text-sm">
          {leaderboard.status === "finished"
            ? t("leaderboards.participants.lockedFinished")
            : t("leaderboards.participants.lockedDraft")}
        </p>
      )}
      <Card>
        <CardContent className="flex flex-col gap-4">
          <Tabs
            onValueChange={(value) =>
              setQuery({
                filter:
                  value as (typeof LEADERBOARD_PARTICIPANT_FILTERS)[number],
                page: 1,
              })
            }
            value={filter}
          >
            <TabsList className="px-4">
              {LEADERBOARD_PARTICIPANT_FILTERS.map((item) => (
                <TabsTrigger className="py-3" key={item} value={item}>
                  {t(FILTER_LABEL_KEY[item])}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <DataTable table={table}>
            <DataTableToolbar table={table} />
          </DataTable>
        </CardContent>
      </Card>
      <AuditLogDialog
        leaderboardId={leaderboard.id}
        onOpenChange={(open) => !open && setDialog(null)}
        open={dialog === "audit"}
        workspaceId={workspaceId}
      />
      {dialog === "export" ? (
        <ExportLeaderboardDialog
          leaderboardId={leaderboard.id}
          onOpenChange={(open) => !open && setDialog(null)}
          open
          workspaceId={workspaceId}
        />
      ) : null}
    </div>
  )
}
