"use client"

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@chatbotx.io/ui/components/ui/chart"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@chatbotx.io/ui/components/ui/table"
import { formatDate } from "@chatbotx.io/ui/lib/format"
import { useQuery } from "@tanstack/react-query"
import { useLocale, useTranslations } from "next-intl"
import { useMemo } from "react"
import { Cell, Pie, PieChart } from "recharts"
import { orpc } from "@/lib/orpc/query"

type Theme = { light: string; dark: string }

/** Categorical slots in fixed order; candidates past the last slot fold into "Other". */
const SLOT_COLORS: Theme[] = [
  { light: "#2a78d6", dark: "#3987e5" },
  { light: "#eb6834", dark: "#d95926" },
  { light: "#1baf7a", dark: "#199e70" },
  { light: "#eda100", dark: "#c98500" },
  { light: "#e87ba4", dark: "#d55181" },
]
const OTHER_COLOR: Theme = { light: "#9ca3af", dark: "#6b7280" }
const PIE_OUTER_RADIUS = 64
const PIE_INNER_RADIUS = 44

type Slice = { key: string; label: string; value: number; theme: Theme }

type PollAnalyticsProps = {
  workspaceId: string
  pollId: string
}

function PieCard({ title, slices }: { title: string; slices: Slice[] }) {
  const t = useTranslations("pollManager.analytics")
  const visible = slices.filter((slice) => slice.value > 0)
  const config = Object.fromEntries(
    slices.map((slice) => [
      slice.key,
      { label: slice.label, theme: slice.theme },
    ]),
  ) satisfies ChartConfig

  return (
    <figure
      aria-label={title}
      className="flex flex-col items-center gap-2 rounded-lg border bg-card p-3"
    >
      <figcaption className="font-medium text-sm">{title}</figcaption>
      {visible.length === 0 ? (
        <div className="m-2 flex size-32 items-center justify-center rounded-full border-[20px] border-muted text-center text-muted-foreground text-xs">
          {t("noVotes")}
        </div>
      ) : (
        <ChartContainer className="aspect-square h-36 w-36" config={config}>
          <PieChart>
            <ChartTooltip
              content={<ChartTooltipContent hideLabel nameKey="key" />}
            />
            <Pie
              data={visible}
              dataKey="value"
              innerRadius={PIE_INNER_RADIUS}
              nameKey="key"
              outerRadius={PIE_OUTER_RADIUS}
              stroke={visible.length > 1 ? "var(--card)" : "none"}
              strokeWidth={2}
            >
              {visible.map((slice) => (
                <Cell fill={`var(--color-${slice.key})`} key={slice.key} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
      )}
      <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-muted-foreground text-xs">
        {slices.map((slice) => (
          <li className="flex items-center gap-1.5" key={slice.key}>
            <span
              aria-hidden
              className="size-2.5 rounded-sm dark:hidden"
              style={{ backgroundColor: slice.theme.light }}
            />
            <span
              aria-hidden
              className="hidden size-2.5 rounded-sm dark:block"
              style={{ backgroundColor: slice.theme.dark }}
            />
            {slice.label} ({slice.value})
          </li>
        ))}
      </ul>
    </figure>
  )
}

const pct = (value: number) => `${value}%`

export function PollAnalytics({ workspaceId, pollId }: PollAnalyticsProps) {
  const t = useTranslations("pollManager.analytics")
  const locale = useLocale()
  const input = { workspaceId, id: pollId }
  // One request: the analytics response carries the poll's header fields.
  const analytics = useQuery(
    orpc.pollsAPI.getPollAnalyticsAPI.queryOptions({ input }),
  )

  const pies = useMemo(() => {
    if (!analytics.data) {
      return null
    }
    const { candidates, gender } = analytics.data
    const results: Slice[] = candidates
      .slice(0, SLOT_COLORS.length)
      .map((candidate, index) => ({
        key: `c${index}`,
        label: candidate.name,
        value: candidate.totalVotes,
        theme: SLOT_COLORS[index] ?? OTHER_COLOR,
      }))
    const rest = candidates.slice(SLOT_COLORS.length)
    if (rest.length > 0) {
      results.push({
        key: "other",
        label: t("other"),
        value: rest.reduce((sum, candidate) => sum + candidate.totalVotes, 0),
        theme: OTHER_COLOR,
      })
    }
    const genders: Slice[] = [
      {
        key: "male",
        label: t("male"),
        value: gender.male,
        theme: SLOT_COLORS[0] as Theme,
      },
      {
        key: "female",
        label: t("female"),
        value: gender.female,
        theme: SLOT_COLORS[4] as Theme,
      },
      {
        key: "unknown",
        label: t("unknown"),
        value: gender.unknown,
        theme: OTHER_COLOR,
      },
    ]
    return { results, genders }
  }, [analytics.data, t])

  if (analytics.isError) {
    return <p className="text-destructive text-sm">{t("loadError")}</p>
  }
  if (!(analytics.data && pies)) {
    return <Skeleton className="h-64 w-full" />
  }

  const { data } = analytics
  const { poll } = data
  return (
    <div className="flex flex-col gap-4">
      <header className="flex items-center gap-4">
        {/* biome-ignore lint/performance/noImgElement: remote user-uploaded poll image */}
        <img
          alt={poll.name}
          className="size-16 rounded-md border object-cover"
          height={64}
          src={poll.imageUrl}
          width={64}
        />
        <div className="flex flex-col gap-1">
          <h1 className="font-semibold text-xl">{poll.name}</h1>
          <p className="text-muted-foreground text-sm">
            {formatDate(poll.startsAt, { locale })} -{" "}
            {formatDate(poll.endsAt, { locale })}
          </p>
          <p className="text-sm">
            {t("totalVotes")}: <strong>{data.totalVotes}</strong>
          </p>
        </div>
      </header>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.name")}</TableHead>
              <TableHead className="text-right">
                {t("columns.totalVotes")}
              </TableHead>
              <TableHead className="text-right">
                {t("columns.totalPercent")}
              </TableHead>
              <TableHead className="text-right">
                {t("columns.maleVotes")}
              </TableHead>
              <TableHead className="text-right">
                {t("columns.malePercent")}
              </TableHead>
              <TableHead className="text-right">
                {t("columns.femaleVotes")}
              </TableHead>
              <TableHead className="text-right">
                {t("columns.femalePercent")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.candidates.map((candidate) => (
              <TableRow key={candidate.id}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {candidate.imageUrl ? (
                      // biome-ignore lint/performance/noImgElement: remote user-uploaded candidate image
                      <img
                        alt=""
                        className="size-8 rounded object-cover"
                        height={32}
                        src={candidate.imageUrl}
                        width={32}
                      />
                    ) : null}
                    {candidate.name}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  {candidate.totalVotes}
                </TableCell>
                <TableCell className="text-right">
                  {pct(candidate.totalPercent)}
                </TableCell>
                <TableCell className="text-right">
                  {candidate.maleVotes}
                </TableCell>
                <TableCell className="text-right">
                  {pct(candidate.malePercent)}
                </TableCell>
                <TableCell className="text-right">
                  {candidate.femaleVotes}
                </TableCell>
                <TableCell className="text-right">
                  {pct(candidate.femalePercent)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <PieCard slices={pies.results} title={t("results")} />
        <PieCard slices={pies.genders} title={t("votesPerGender")} />
      </div>
    </div>
  )
}
