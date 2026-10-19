"use client"

import type { HumanAgentStats } from "@chatbotx.io/analytics"
import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import type { ColumnDef } from "@chatbotx.io/ui/types/data-table"
import { ClockIcon, InfoIcon } from "lucide-react"
import type { useTranslations } from "next-intl"
import { formatDuration } from "../../utils/format-duration"

type Translate = ReturnType<typeof useTranslations>

type ResponseTimeKey =
  | "avgResponseSeconds"
  | "avgWorkingResponseSeconds"
  | "avgFirstResponseSeconds"
  | "avgWorkingFirstResponseSeconds"

type ResponseTimeColumnSpec = {
  key: ResponseTimeKey
  titleKey: "analytics.responseTime" | "analytics.firstResponseTime"
  helpKey:
    | "analytics.averageResponseTimeHelp"
    | "analytics.averageFirstResponseTimeByAdminHelp"
    | "analytics.withinWorkingHoursHelp"
  withinWorkingHours: boolean
}

export const RESPONSE_TIME_COLUMN_SPECS: readonly ResponseTimeColumnSpec[] = [
  {
    key: "avgResponseSeconds",
    titleKey: "analytics.responseTime",
    helpKey: "analytics.averageResponseTimeHelp",
    withinWorkingHours: false,
  },
  {
    key: "avgWorkingResponseSeconds",
    titleKey: "analytics.responseTime",
    helpKey: "analytics.withinWorkingHoursHelp",
    withinWorkingHours: true,
  },
  {
    key: "avgFirstResponseSeconds",
    titleKey: "analytics.firstResponseTime",
    helpKey: "analytics.averageFirstResponseTimeByAdminHelp",
    withinWorkingHours: false,
  },
  {
    key: "avgWorkingFirstResponseSeconds",
    titleKey: "analytics.firstResponseTime",
    helpKey: "analytics.withinWorkingHoursHelp",
    withinWorkingHours: true,
  },
]

/**
 * `null` means "no data / no schedule". TanStack only pushes `undefined` to the
 * end in BOTH sort directions (`sortUndefined: "last"`), so null is mapped to it.
 */
export function responseSecondsAccessor(
  row: HumanAgentStats,
  key: ResponseTimeKey,
): number | undefined {
  return row[key] ?? undefined
}

function HelpIcon({
  icon: Icon,
  label,
  text,
}: {
  icon: typeof InfoIcon
  label: string
  text: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            aria-label={label}
            className="inline-flex shrink-0 rounded-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            type="button"
          />
        }
      >
        <Icon aria-hidden className="size-4" />
      </TooltipTrigger>
      <TooltipContent>
        <p>{text}</p>
      </TooltipContent>
    </Tooltip>
  )
}

export function buildResponseTimeColumns(
  t: Translate,
  locale: string,
): ColumnDef<HumanAgentStats>[] {
  return RESPONSE_TIME_COLUMN_SPECS.map((spec) => ({
    id: spec.key,
    accessorFn: (row: HumanAgentStats) =>
      responseSecondsAccessor(row, spec.key),
    header: ({ column }) => (
      <div className="flex items-center gap-1">
        <DataTableColumnHeader
          column={column}
          title={
            <>
              {t(spec.titleKey)}
              {spec.withinWorkingHours && (
                <span className="sr-only">
                  {" "}
                  {t("analytics.withinWorkingHoursLabel")}
                </span>
              )}
            </>
          }
        />
        <HelpIcon
          icon={spec.withinWorkingHours ? ClockIcon : InfoIcon}
          label={
            spec.withinWorkingHours
              ? t("analytics.withinWorkingHoursLabel")
              : t(spec.titleKey)
          }
          text={t(spec.helpKey)}
        />
      </div>
    ),
    cell: ({ row }) => {
      const seconds = responseSecondsAccessor(row.original, spec.key)
      if (seconds === undefined) {
        return (
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  aria-label={t("analytics.noResponseData")}
                  className="rounded-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  type="button"
                />
              }
            >
              <span aria-hidden>—</span>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t("analytics.noResponseData")}</p>
            </TooltipContent>
          </Tooltip>
        )
      }
      return (
        <span className="tabular-nums">{formatDuration(seconds, locale)}</span>
      )
    },
    enableSorting: true,
    enableHiding: false,
    sortUndefined: "last",
  }))
}
