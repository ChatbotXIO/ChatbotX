"use client"

import { DateRangePresetFilter } from "@chatbotx.io/analytics-nextjs/components/date-range-preset-filter"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@chatbotx.io/ui/components/ui/card"
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@chatbotx.io/ui/components/ui/chart"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  ArrowDownIcon,
  ArrowUpIcon,
  Loader2Icon,
  RefreshCwIcon,
} from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import { useLocale, useTranslations } from "next-intl"
import { useTransition } from "react"
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
import {
  parseLocalDateKey,
  toLocalDateKey,
} from "@/features/ads/lib/ads-date-key"
import { resolveRangePreset } from "@/features/integration-google-ads/lib/stats-preset"
import {
  formatOrderMoney,
  type StoreCurrencyFormat,
} from "@/features/orders/lib/order-money"
import type { EcommerceAnalyticsResource } from "../schema/public"

type Stat = EcommerceAnalyticsResource["sales"]

function Change({ change }: { change: number | null }) {
  const t = useTranslations("ecommerceAnalytics")
  if (change === null) {
    return (
      <span className="text-muted-foreground text-xs">{t("noPrevious")}</span>
    )
  }
  const Icon = change < 0 ? ArrowDownIcon : ArrowUpIcon
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs tabular-nums",
        change > 0 && "text-green-600 dark:text-green-400",
        change < 0 && "text-destructive",
        change === 0 && "text-muted-foreground",
      )}
    >
      {change === 0 ? null : <Icon aria-hidden className="size-3" />}
      {t("change", { value: Math.abs(change) })}
    </span>
  )
}

function StatCard({
  label,
  stat,
  format,
}: {
  label: string
  stat: Stat
  format: (value: number) => string
}) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-1 p-4 text-center">
        <p className="text-muted-foreground text-sm">{label}</p>
        <p className="font-semibold text-2xl tabular-nums">
          {format(stat.value)}
        </p>
        <Change change={stat.change} />
      </CardContent>
    </Card>
  )
}

function SeriesChart({
  title,
  data,
  dataKey,
  label,
  color,
  formatTick,
  formatValue,
  allowDecimals,
}: {
  title: string
  data: EcommerceAnalyticsResource["series"]
  dataKey: "sales" | "orders"
  label: string
  color: string
  formatTick: (key: string) => string
  formatValue: (value: number) => string
  allowDecimals: boolean
}) {
  const config = { [dataKey]: { label, color } } satisfies ChartConfig
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer className="aspect-auto h-64 w-full" config={config}>
          <LineChart data={data} margin={{ left: 8, right: 8 }}>
            <CartesianGrid vertical={false} />
            <XAxis
              axisLine={false}
              dataKey="key"
              minTickGap={24}
              tickFormatter={formatTick}
              tickLine={false}
            />
            <YAxis
              allowDecimals={allowDecimals}
              axisLine={false}
              tickFormatter={(value: number) =>
                dataKey === "sales" ? formatValue(value) : String(value)
              }
              tickLine={false}
              width={dataKey === "sales" ? 72 : 32}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => formatValue(Number(value))}
                  labelFormatter={(value) => formatTick(String(value))}
                />
              }
            />
            <Line
              dataKey={dataKey}
              dot={false}
              stroke={`var(--color-${dataKey})`}
              strokeWidth={2}
              type="monotone"
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}

function TopTable({
  title,
  rows,
  formatValue,
}: {
  title: string
  rows: Array<{ key: string; name: string; sales: number }>
  formatValue: (value: number) => string
}) {
  const t = useTranslations("ecommerceAnalytics")
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.name")}</TableHead>
              <TableHead className="text-end">{t("columns.sales")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell
                  className="text-center text-muted-foreground"
                  colSpan={2}
                >
                  {t("noData")}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.key}>
                  <TableCell className="max-w-64 truncate">
                    {row.name}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">
                    {formatValue(row.sales)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

/** The store's sales dashboard (spec image 27). */
export function AnalyticsDashboard({
  data,
  store,
  workspaceCreatedAt,
  referenceNow,
}: {
  data: EcommerceAnalyticsResource
  store: StoreCurrencyFormat
  workspaceCreatedAt: Date
  /** The server's instant, so render and hydration name the same preset. */
  referenceNow: string
}) {
  const t = useTranslations("ecommerceAnalytics")
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const [isRefreshing, startRefresh] = useTransition()
  const money = (value: number) => formatOrderMoney(value, data.currency, store)
  const count = (value: number) => new Intl.NumberFormat(locale).format(value)

  const formatTick = (key: string) => {
    if (data.granularity === "hour") {
      return `${key.slice(11, 13)}:00`
    }
    return new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${key}T00:00:00Z`))
  }

  const changeRange = (range: { from: Date; to: Date }) => {
    const params = new URLSearchParams({
      from: toLocalDateKey(range.from),
      to: toLocalDateKey(range.to),
    })
    router.push(`${pathname}?${params.toString()}`)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          aria-label={t("refresh")}
          disabled={isRefreshing}
          onClick={() => startRefresh(() => router.refresh())}
          size="icon"
          variant="ghost"
        >
          {isRefreshing ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <RefreshCwIcon />
          )}
        </Button>
        <DateRangePresetFilter
          defaultPreset={resolveRangePreset({
            range: { from: data.from, to: data.to },
            tz: data.timezone,
            workspaceCreatedAt,
            now: new Date(referenceNow),
          })}
          initialFrom={parseLocalDateKey(data.from).getTime()}
          initialTo={parseLocalDateKey(data.to).getTime()}
          key={`${data.from}_${data.to}`}
          onChange={changeRange}
          workspaceCreatedAt={workspaceCreatedAt}
        />
      </div>

      {data.otherCurrencyOrders > 0 ? (
        <p className="text-muted-foreground text-sm">
          {t("otherCurrencyOrders", {
            count: count(data.otherCurrencyOrders),
          })}
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard format={money} label={t("lifetime")} stat={data.lifetime} />
        <StatCard format={money} label={t("sales")} stat={data.sales} />
        <StatCard format={count} label={t("orders")} stat={data.orders} />
        <StatCard format={count} label={t("products")} stat={data.products} />
      </div>

      <SeriesChart
        allowDecimals
        color="var(--chart-1)"
        data={data.series}
        dataKey="sales"
        formatTick={formatTick}
        formatValue={money}
        label={t("sales")}
        title={t("salesByDate")}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <SeriesChart
          allowDecimals={false}
          color="var(--chart-2)"
          data={data.series}
          dataKey="orders"
          formatTick={formatTick}
          formatValue={count}
          label={t("orders")}
          title={t("ordersByDate")}
        />
        <TopTable
          formatValue={money}
          rows={data.topProducts.map((row) => ({
            key: row.productId ?? row.name,
            name: row.name,
            sales: row.sales,
          }))}
          title={t("topProducts")}
        />
        <TopTable
          formatValue={money}
          rows={data.topVendors.map((row) => ({
            key: row.vendorId ?? row.name,
            name: row.name,
            sales: row.sales,
          }))}
          title={t("topVendors")}
        />
      </div>
    </div>
  )
}
