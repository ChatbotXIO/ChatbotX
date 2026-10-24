"use client"

import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { DataTablePagination } from "@chatbotx.io/ui/components/data-table/data-table-pagination"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import {
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import { getCommonPinningStyles } from "@chatbotx.io/ui/lib/data-table"
import { getSortingStateParser } from "@chatbotx.io/ui/lib/parsers"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { type Column, type ColumnDef, flexRender } from "@tanstack/react-table"
import { InfoIcon } from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs"
import { type CSSProperties, useCallback, useMemo } from "react"
import { orpc } from "@/lib/orpc/query"
import { useMarketingMessagesNameLookups } from "../../hooks/use-marketing-messages-name-lookups"
import {
  formatStatCount,
  formatStatMoney,
  formatStatRate,
} from "../../lib/statistics-format"
import type {
  StatisticsMetrics,
  StatisticsOutput,
} from "../../schema/statistics"
import { StatisticsToolbar } from "./statistics-toolbar"

type StatisticsRow = StatisticsOutput["rows"][number]
type MetricKey = keyof StatisticsMetrics

/**
 * `footer`: whether Meta's page aggregate is a sum ("Total") or a weighted
 * average ("Average") for that column. `note`: which regional-exclusion
 * tooltip the header carries (spec U15).
 */
const METRIC_COLUMNS: {
  key: MetricKey
  kind: "count" | "rate" | "money"
  footer: "total" | "average"
  note?: "delivery" | "clicks"
}[] = [
  { key: "delivered", kind: "count", footer: "total", note: "delivery" },
  { key: "readRate", kind: "rate", footer: "average", note: "delivery" },
  { key: "linkClicks", kind: "count", footer: "total", note: "clicks" },
  { key: "linkClickRate", kind: "rate", footer: "average", note: "clicks" },
  { key: "costPerClick", kind: "money", footer: "average", note: "clicks" },
  { key: "costPerDelivery", kind: "money", footer: "average" },
  { key: "spend", kind: "money", footer: "total" },
]

const DEFAULT_PER_PAGE = 20
const SORTABLE_COLUMNS = ["campaignId", "name"] as const

/**
 * The toolbar filters plus the same `page`/`perPage`/`sort` URL keys
 * `useDataTable` owns, read here first so they can feed the query before the
 * table (which needs the query's rows) exists.
 */
const statisticsUrlParsers = {
  adAccountId: parseAsString,
  since: parseAsString,
  until: parseAsString,
  search: parseAsString.withDefault(""),
  page: parseAsInteger.withDefault(1),
  perPage: parseAsInteger.withDefault(DEFAULT_PER_PAGE),
  sort: getSortingStateParser<StatisticsRow>([...SORTABLE_COLUMNS]).withDefault(
    [],
  ),
}

export function StatisticsTable({
  workspaceId,
  readOnly,
}: {
  workspaceId: string
  readOnly: boolean
}) {
  const t = useTranslations()
  const locale = useLocale()
  const [filters, setFilters] = useQueryStates(statisticsUrlParsers)
  const { pageNameById } = useMarketingMessagesNameLookups(
    workspaceId,
    readOnly,
  )

  const formatMetric = useCallback(
    (
      kind: (typeof METRIC_COLUMNS)[number]["kind"],
      value: number | null,
      currency: string | null,
    ) => {
      if (kind === "count") {
        return formatStatCount(value, locale)
      }
      if (kind === "rate") {
        return formatStatRate(value, locale)
      }
      return formatStatMoney(value, currency, locale)
    },
    [locale],
  )

  const sort = filters.sort[0]
  const query = useQuery({
    ...orpc.facebookMarketingMessagesAPI.getMarketingMessagesStatisticsAPI.queryOptions(
      {
        input: {
          workspaceId,
          adAccountId: filters.adAccountId ?? undefined,
          since: filters.since ?? undefined,
          until: filters.until ?? undefined,
          search: filters.search || undefined,
          page: filters.page,
          perPage: filters.perPage,
          sort:
            sort?.id === "campaignId" || sort?.id === "name"
              ? sort.id
              : undefined,
          order: sort?.desc ? "desc" : "asc",
        },
      },
    ),
    enabled: !readOnly,
    placeholderData: keepPreviousData,
  })
  const data = query.data
  const currency = data?.currency ?? null

  const columns = useMemo(
    (): ColumnDef<StatisticsRow>[] => [
      {
        id: "campaignId",
        accessorKey: "campaignId",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("facebookMarketingMessages.statistics.columns.id")}
          />
        ),
        size: 190,
      },
      {
        id: "name",
        accessorKey: "name",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("facebookMarketingMessages.statistics.columns.name")}
          />
        ),
        size: 220,
      },
      {
        id: "pageId",
        accessorKey: "pageId",
        header: t("facebookMarketingMessages.statistics.columns.page"),
        cell: ({ row }) =>
          pageNameById.get(row.original.pageId) ?? row.original.pageId,
        enableSorting: false,
      },
      ...METRIC_COLUMNS.map(
        (metric): ColumnDef<StatisticsRow> => ({
          id: metric.key,
          accessorKey: metric.key,
          enableSorting: false,
          header: () => (
            <MetricHeader
              label={t(
                `facebookMarketingMessages.statistics.columns.${metric.key}`,
              )}
              note={
                metric.note &&
                t(`facebookMarketingMessages.statistics.notes.${metric.note}`)
              }
            />
          ),
          cell: ({ row }) => (
            <div className="text-right tabular-nums">
              {formatMetric(metric.kind, row.original[metric.key], currency)}
            </div>
          ),
        }),
      ),
    ],
    [t, pageNameById, formatMetric, currency],
  )

  const { table } = useDataTable({
    data: data?.rows ?? [],
    columns,
    pageCount: data?.pagination.pageCount ?? -1,
    initialState: {
      pagination: { pageIndex: 0, pageSize: DEFAULT_PER_PAGE },
      columnPinning: { left: ["campaignId", "name"] },
    },
    getRowId: (row) => row.id,
    clearOnDefault: true,
  })

  const resetPage = () => table.setPageIndex(0)
  const onSearchChange = useCallback(
    (search: string) => {
      setFilters({ search: search || null })
      table.setPageIndex(0)
    },
    [setFilters, table],
  )

  if (readOnly) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground text-sm">
          {t("facebookMarketingMessages.statistics.readOnly")}
        </CardContent>
      </Card>
    )
  }

  if (data && data.adAccountId === null) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground text-sm">
          {t("facebookMarketingMessages.statistics.empty")}
        </CardContent>
      </Card>
    )
  }

  const rows = table.getRowModel().rows
  const visibleColumns = table.getVisibleLeafColumns()

  return (
    <Card>
      <CardContent className="flex flex-col gap-3">
        <StatisticsToolbar
          adAccountId={data?.adAccountId ?? null}
          adAccounts={data?.adAccounts ?? []}
          onAdAccountChange={(adAccountId) => {
            setFilters({ adAccountId })
            resetPage()
          }}
          onRangeChange={(range) => {
            setFilters(range)
            resetPage()
          }}
          onSearchChange={onSearchChange}
          search={filters.search}
          since={data?.since ?? filters.since ?? ""}
          timezone={data?.timezone ?? "UTC"}
          until={data?.until ?? filters.until ?? ""}
        />

        {query.error && (
          <p className="text-destructive text-sm" role="alert">
            {query.error.message}
          </p>
        )}

        <div className="max-h-[70vh] overflow-auto rounded-md border">
          {/* A plain <table>: the shared <Table> adds its own overflow wrapper,
              which would become the sticky header/footer's scroll container
              instead of this one. */}
          <table className="w-full caption-bottom text-sm">
            <TableHeader className="sticky top-0 z-20 bg-muted">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead
                      className="whitespace-nowrap bg-muted"
                      key={header.id}
                      style={pinStyle(header.column, "muted")}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {query.isPending &&
                Array.from({ length: 5 }, (_, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton rows
                  <TableRow key={index}>
                    {visibleColumns.map((column) => (
                      <TableCell key={column.id}>
                        <Skeleton className="h-4 w-full" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              {!query.isPending && rows.length === 0 && (
                <TableRow>
                  <TableCell
                    className="h-24 text-center text-muted-foreground"
                    colSpan={visibleColumns.length}
                  >
                    {t("facebookMarketingMessages.statistics.noResults")}
                  </TableCell>
                </TableRow>
              )}
              {rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell
                      className="whitespace-nowrap"
                      key={cell.id}
                      style={pinStyle(cell.column, "background")}
                    >
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
            <TableFooter className="sticky bottom-0 z-20 bg-muted">
              <TableRow>
                {visibleColumns.map((column) => {
                  const metric = METRIC_COLUMNS.find(
                    (item) => item.key === column.id,
                  )
                  return (
                    <TableCell
                      className="whitespace-nowrap bg-muted"
                      key={column.id}
                      style={pinStyle(column, "muted")}
                    >
                      {column.id === "campaignId" &&
                        t("facebookMarketingMessages.statistics.footer.label", {
                          count: rows.length,
                        })}
                      {metric && (
                        <div className="flex flex-col items-end">
                          <span className="font-semibold tabular-nums">
                            {formatMetric(
                              metric.kind,
                              data?.aggregate?.[metric.key] ?? null,
                              data?.currency ?? null,
                            )}
                          </span>
                          <span className="font-normal text-muted-foreground text-xs">
                            {t(
                              `facebookMarketingMessages.statistics.footer.${metric.footer}`,
                            )}
                          </span>
                        </div>
                      )}
                    </TableCell>
                  )
                })}
              </TableRow>
            </TableFooter>
          </table>
        </div>

        {data?.aggregateUnavailable && (
          <p className="text-muted-foreground text-xs">
            {t("facebookMarketingMessages.statistics.totalsUnavailable")}
          </p>
        )}

        <DataTablePagination table={table} />
      </CardContent>
    </Card>
  )
}

function MetricHeader({ label, note }: { label: string; note?: string }) {
  if (!note) {
    return <div className="text-right">{label}</div>
  }
  return (
    <div className="flex items-center justify-end gap-1">
      {label}
      <Tooltip>
        <TooltipTrigger
          render={
            <InfoIcon
              aria-label={note}
              className={cn("size-3.5 text-muted-foreground")}
            />
          }
        />
        <TooltipContent className="max-w-64">{note}</TooltipContent>
      </Tooltip>
    </div>
  )
}

/**
 * `getCommonPinningStyles` paints pinned cells with `hsl(var(--background))`,
 * which is invalid for this theme's oklch tokens and renders transparent —
 * scrolled metric cells would show through the pinned ID/Name columns.
 */
function pinStyle<TData>(
  column: Column<TData>,
  surface: "background" | "muted",
): CSSProperties {
  return {
    ...getCommonPinningStyles({ column, withBorder: true }),
    background: `var(--${surface})`,
  }
}
