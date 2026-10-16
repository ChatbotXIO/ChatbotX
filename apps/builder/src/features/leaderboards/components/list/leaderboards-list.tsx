"use client"

import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@chatbotx.io/ui/components/ui/tabs"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import type { ColumnDef } from "@tanstack/react-table"
import { PlusIcon, TrophyIcon, ZapIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { parseAsInteger, parseAsStringLiteral, useQueryStates } from "nuqs"
import { type ReactNode, use, useMemo } from "react"
import { useInboxList } from "@/features/inboxes/provider/inbox-hook"
import {
  LEADERBOARD_PLATFORM_LABEL_KEY,
  LEADERBOARD_PLATFORMS,
} from "../../lib/platforms"
import {
  LEADERBOARD_STATUS_TABS,
  type LeaderboardStatusTab,
} from "../../lib/search-params"
import type { LeaderboardRow, ListLeaderboardsResult } from "../../queries"
import { LeaderboardStatusBadge } from "../leaderboard-status-badge"
import {
  LeaderboardCampaignCell,
  LeaderboardChannelCell,
  LeaderboardParticipantsCell,
  LeaderboardPointsCell,
} from "./leaderboard-cells"
import { LeaderboardRowMenu } from "./leaderboard-row-menu"

const STATUS_TAB_LABEL_KEY = {
  all: "leaderboards.tabs.all",
  active: "leaderboards.tabs.active",
  paused: "leaderboards.tabs.paused",
  finished: "leaderboards.tabs.finished",
} as const satisfies Record<LeaderboardStatusTab, string>

type Props = {
  workspaceId: string
  promises: Promise<[ListLeaderboardsResult]>
  minigameNames: Record<string, string>
}

function KpiCard({
  icon,
  label,
  value,
}: {
  icon: ReactNode
  label: string
  value: number
}) {
  return (
    <Card className="py-4">
      <CardContent className="flex items-center gap-4">
        <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          {icon}
        </div>
        <div className="flex flex-col">
          <span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
            {label}
          </span>
          <span className="font-bold text-2xl">{value.toLocaleString()}</span>
        </div>
      </CardContent>
    </Card>
  )
}

export function LeaderboardsList({
  workspaceId,
  promises,
  minigameNames,
}: Props) {
  const t = useTranslations()
  const [{ data, pageCount, summary }] = use(promises)
  const inboxes = useInboxList()
  const inboxNames = useMemo(
    () =>
      Object.fromEntries(
        inboxes.map((inbox) => [inbox.id, inbox.name]),
      ) as Record<string, string>,
    [inboxes],
  )
  const [{ status }, setQuery] = useQueryStates(
    {
      status: parseAsStringLiteral(LEADERBOARD_STATUS_TABS).withDefault("all"),
      page: parseAsInteger.withDefault(1),
    },
    { shallow: false, clearOnDefault: true },
  )

  const columns = useMemo<ColumnDef<LeaderboardRow>[]>(
    () => [
      {
        id: "name",
        accessorKey: "name",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("leaderboards.list.campaign")}
          />
        ),
        cell: ({ row }) => (
          <LeaderboardCampaignCell
            href={`/space/${workspaceId}/leaderboards/${row.original.id}/participants`}
            leaderboard={row.original}
          />
        ),
        meta: {
          label: t("fields.name.label"),
          placeholder: t("leaderboards.list.searchPlaceholder"),
          variant: "text",
        },
        enableColumnFilter: true,
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "platform",
        accessorKey: "platform",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.channel.label")}
          />
        ),
        cell: ({ row }) => (
          <LeaderboardChannelCell
            hostName={
              row.original.platform === "gamification"
                ? (minigameNames[row.original.minigameId ?? ""] ?? null)
                : (inboxNames[row.original.inboxId ?? ""] ?? null)
            }
            leaderboard={row.original}
          />
        ),
        meta: {
          label: t("leaderboards.list.platformFilter"),
          variant: "select",
          options: LEADERBOARD_PLATFORMS.map((platform) => ({
            label: t(LEADERBOARD_PLATFORM_LABEL_KEY[platform]),
            value: platform,
          })),
        },
        enableColumnFilter: true,
        enableSorting: false,
      },
      {
        id: "participants",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("leaderboards.list.participants")}
          />
        ),
        cell: ({ row }) => (
          <LeaderboardParticipantsCell stats={row.original.stats} />
        ),
        enableSorting: false,
      },
      {
        id: "totalPoints",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("leaderboards.list.totalPoints")}
          />
        ),
        cell: ({ row }) => <LeaderboardPointsCell stats={row.original.stats} />,
        enableSorting: false,
      },
      {
        id: "status",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.status.label")}
          />
        ),
        cell: ({ row }) => (
          <LeaderboardStatusBadge status={row.original.status} />
        ),
        enableSorting: false,
      },
      {
        id: "action",
        size: 10,
        header: () => null,
        cell: ({ row }) => (
          <LeaderboardRowMenu
            leaderboard={row.original}
            workspaceId={workspaceId}
          />
        ),
        enableSorting: false,
        enableHiding: false,
      },
    ],
    [t, workspaceId, inboxNames, minigameNames],
  )

  const { table } = useDataTable({
    data,
    columns,
    pageCount,
    initialState: { columnPinning: { right: ["action"] } },
    getRowId: (row) => row.id,
    shallow: false,
    clearOnDefault: true,
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-bold text-xl">{t("leaderboards.title")}</h1>
        <Button
          nativeButton={false}
          render={<Link href={`/space/${workspaceId}/leaderboards/create`} />}
          size="sm"
        >
          <PlusIcon />
          {t("leaderboards.create")}
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <KpiCard
          icon={<TrophyIcon className="size-5" />}
          label={t("leaderboards.kpi.total")}
          value={summary.total}
        />
        <KpiCard
          icon={<ZapIcon className="size-5" />}
          label={t("leaderboards.kpi.active")}
          value={summary.active}
        />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <Tabs
            onValueChange={(value) =>
              setQuery({ status: value as LeaderboardStatusTab, page: 1 })
            }
            value={status}
          >
            <TabsList className="px-4">
              {LEADERBOARD_STATUS_TABS.map((tab) => (
                <TabsTrigger className="py-3" key={tab} value={tab}>
                  {t(STATUS_TAB_LABEL_KEY[tab])}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <DataTable table={table}>
            <DataTableToolbar table={table} />
          </DataTable>
        </CardContent>
      </Card>
    </div>
  )
}
