"use client"

import { DateRangePresetFilter } from "@chatbotx.io/analytics-nextjs/components/date-range-preset-filter"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@chatbotx.io/ui/components/ui/chart"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@chatbotx.io/ui/components/ui/sheet"
import { formatCompactNumber } from "@chatbotx.io/ui/lib/number-format"
import { useQuery } from "@tanstack/react-query"
import { ArrowDownIcon, ArrowLeftIcon, ArrowUpIcon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { browserTimeZone } from "@/features/custom-fields/lib/field-date"
import { resolveRangePreset } from "@/features/integration-google-ads/lib/stats-preset"
import { useWorkspaceMembers } from "@/features/users/provider/user-hook"
import { orpc } from "@/lib/orpc/query"
import { dayKeysFromDates, rangeEndingToday } from "../../lib/analytics-range"
import { formatItemValue } from "../../lib/format-item-value"
import { itemNounKeys } from "../../lib/item-noun"
import type { BoardPipeline } from "../board/types"
import { AdminPies } from "./admin-pies"
import { type AdminRow, AdminsTable } from "./admins-table"

type MetricKey = "created" | "won" | "wonValue" | "lost" | "lostValue"

const METRICS = [
  {
    key: "created",
    chartKey: "analytics.chart.created",
    color: "var(--chart-1)",
  },
  { key: "won", chartKey: "analytics.chart.won", color: "var(--chart-2)" },
  { key: "lost", chartKey: "analytics.chart.lost", color: "var(--chart-5)" },
  {
    key: "wonValue",
    chartKey: "analytics.chart.wonValue",
    color: "var(--chart-3)",
  },
  {
    key: "lostValue",
    chartKey: "analytics.chart.lostValue",
    color: "var(--chart-4)",
  },
] as const satisfies ReadonlyArray<{
  key: MetricKey
  chartKey: string
  color: string
}>

const TILE_ORDER: MetricKey[] = [
  "created",
  "won",
  "wonValue",
  "lost",
  "lostValue",
]

const TILE_KEYS = {
  won: "analytics.won",
  wonValue: "analytics.wonValue",
  lost: "analytics.lost",
  lostValue: "analytics.lostValue",
} as const

const isMoneyMetric = (key: MetricKey) =>
  key === "wonValue" || key === "lostValue"

/** The shared filter opens on "Last 7 days". */
const INITIAL_RANGE_DAYS = 7
/** The sheet has no workspace creation date; the filter's own 2020 floor applies. */
const NO_WORKSPACE_CREATED_AT = new Date(0)

type AnalyticsSheetProps = {
  workspaceId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  pipeline: Pick<BoardPipeline, "id" | "name" | "currency" | "type">
}

function ChangeBadge({ delta }: { delta: number | null }) {
  if (delta === null) {
    return <span className="text-muted-foreground text-xs">--</span>
  }
  const Icon = delta >= 0 ? ArrowUpIcon : ArrowDownIcon
  return (
    <span className="inline-flex items-center gap-0.5 text-muted-foreground text-xs">
      <Icon className="size-3" />
      {Math.abs(delta)}%
    </span>
  )
}

export function AnalyticsSheet({
  workspaceId,
  open,
  onOpenChange,
  pipeline,
}: AnalyticsSheetProps) {
  const t = useTranslations("pipelines")
  const locale = useLocale()
  // Day keys and the timezone sent with them must describe the same calendar.
  const timezone = useMemo(() => browserTimeZone(), [])
  // "Today" is re-read whenever the sheet opens or Refresh is pressed, not once at board load.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (open) {
      setNow(new Date())
    }
  }, [open])
  const [pickedRange, setPickedRange] = useState<{
    from: string
    to: string
  } | null>(null)
  // Until the member picks a range, "Last 7 days" follows today.
  const range = useMemo(
    () => pickedRange ?? rangeEndingToday(INITIAL_RANGE_DAYS, timezone, now),
    [pickedRange, timezone, now],
  )
  const { data: members = [] } = useWorkspaceMembers(workspaceId, {
    enabled: open,
  })
  const stats = useQuery(
    orpc.pipelinesAPI.privateGetStatsAPI.queryOptions({
      input: { workspaceId, pipelineId: pipeline.id, ...range, timezone },
      enabled: open,
    }),
  )

  const nouns = t(itemNounKeys[pipeline.type].many)
  const money = (value: number) =>
    formatItemValue(value, pipeline.currency, locale)
  const tileLabel = (key: MetricKey) =>
    key === "created" ? nouns : t(TILE_KEYS[key])

  // The shared filter reports every applied range, its Refresh button
  // included. An unchanged range has the same query key, so it refetches.
  const applyRange = (picked: { from: Date; to: Date }) => {
    const next = dayKeysFromDates(picked, timezone)
    if (next.from === range.from && next.to === range.to) {
      stats.refetch()
      return
    }
    setPickedRange(next)
  }

  const config = Object.fromEntries(
    METRICS.map((metric) => [
      metric.key,
      { label: t(metric.chartKey), color: metric.color },
    ]),
  ) satisfies ChartConfig

  const adminRows = useMemo<AdminRow[]>(() => {
    const byUser = new Map(
      (stats.data?.byActor ?? []).map((row) => [row.actorUserId, row]),
    )
    const zero = { created: 0, won: 0, wonValue: 0, lost: 0, lostValue: 0 }
    const memberRows = members.flatMap((member) =>
      member.user?.id
        ? [
            {
              ...zero,
              ...byUser.get(member.user.id),
              userId: member.user.id,
              name: member.user.name ?? "--",
            },
          ]
        : [],
    )
    const knownIds = new Set(memberRows.map((row) => row.userId))
    // Actors who left the workspace still carry history; keep their rows.
    const strayRows = (stats.data?.byActor ?? [])
      .filter((row) => row.actorUserId && !knownIds.has(row.actorUserId))
      .map((row) => ({
        ...row,
        userId: row.actorUserId,
        name: "--",
      }))
    return [
      ...memberRows,
      ...strayRows,
      {
        ...zero,
        ...byUser.get(null),
        userId: null,
        name: t("analytics.automation"),
      },
    ]
  }, [members, stats.data, t])

  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="w-full sm:max-w-[85vw]">
        <SheetHeader className="flex-row flex-wrap items-center gap-2 pe-12">
          <Button
            aria-label={t("analytics.back")}
            onClick={() => onOpenChange(false)}
            size="icon"
            variant="ghost"
          >
            <ArrowLeftIcon />
          </Button>
          <SheetTitle className="flex-1">{t("analytics.title")}</SheetTitle>
          <DateRangePresetFilter
            defaultPreset={resolveRangePreset({
              range,
              tz: timezone,
              workspaceCreatedAt: NO_WORKSPACE_CREATED_AT,
              now,
            })}
            onChange={applyRange}
          />
        </SheetHeader>
        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto px-4 pb-6 text-sm">
          {stats.isPending ? (
            <p className="text-muted-foreground">{t("analytics.loading")}</p>
          ) : null}
          {stats.isError ? (
            <div className="flex items-center gap-3">
              <p className="text-destructive">{t("analytics.error")}</p>
              <Button
                onClick={() => stats.refetch()}
                size="sm"
                variant="outline"
              >
                {t("retry")}
              </Button>
            </div>
          ) : null}

          {stats.data ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {TILE_ORDER.map((key) => (
                  <div className="rounded-lg border bg-card p-3" key={key}>
                    <p className="truncate text-muted-foreground text-xs">
                      {tileLabel(key)}
                    </p>
                    <p className="truncate font-semibold text-xl">
                      {isMoneyMetric(key)
                        ? money(stats.data.current[key])
                        : stats.data.current[key]}
                    </p>
                    <ChangeBadge delta={stats.data.change[key]} />
                  </div>
                ))}
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {METRICS.map((metric) => (
                  <section
                    aria-label={t(metric.chartKey)}
                    className="rounded-lg border bg-card p-3"
                    key={metric.key}
                  >
                    <h3 className="mb-2 font-medium text-sm">
                      {t(metric.chartKey)}
                    </h3>
                    <ChartContainer
                      className="aspect-auto h-48 w-full"
                      config={config}
                    >
                      <BarChart
                        data={stats.data.daily}
                        margin={{ left: 4, right: 8 }}
                      >
                        <CartesianGrid vertical={false} />
                        <XAxis
                          axisLine={false}
                          dataKey="day"
                          minTickGap={24}
                          tickFormatter={(value: string) => value.slice(5)}
                          tickLine={false}
                        />
                        <YAxis
                          allowDecimals={isMoneyMetric(metric.key)}
                          axisLine={false}
                          tickFormatter={(value: number) =>
                            formatCompactNumber(value, locale)
                          }
                          tickLine={false}
                          width={40}
                        />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar
                          dataKey={metric.key}
                          fill={`var(--color-${metric.key})`}
                          radius={2}
                        />
                      </BarChart>
                    </ChartContainer>
                  </section>
                ))}
              </div>

              <AdminPies rows={adminRows} />

              <section className="grid gap-2">
                <h3 className="font-medium">{t("analytics.admins")}</h3>
                <AdminsTable
                  itemsLabel={nouns}
                  money={money}
                  rows={adminRows}
                />
              </section>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  )
}
