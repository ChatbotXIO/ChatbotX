"use client"

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@chatbotx.io/ui/components/ui/chart"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { Cell, Pie, PieChart } from "recharts"
import { buildAdminPieModel, OTHER_SLICE_KEY } from "../../lib/admin-pie-model"
import type { AdminRow } from "./admins-table"

/**
 * Categorical slots (validated for CVD separation on both chart surfaces);
 * entities past the last slot fold into "Other" instead of a generated hue.
 */
const SLOT_COLORS = [
  { light: "#2a78d6", dark: "#3987e5" },
  { light: "#eb6834", dark: "#d95926" },
  { light: "#1baf7a", dark: "#199e70" },
  { light: "#eda100", dark: "#c98500" },
  { light: "#e87ba4", dark: "#d55181" },
] as const
const OTHER_COLOR = { light: "#9ca3af", dark: "#6b7280" } as const
// Matches the empty-state ring: a 128px circle with a 20px band.
const PIE_OUTER_RADIUS = 64
const PIE_INNER_RADIUS = 44

const PIE_METRICS = [
  { key: "created", titleKey: "analytics.pie.created" },
  { key: "won", titleKey: "analytics.pie.won" },
  { key: "lost", titleKey: "analytics.pie.lost" },
] as const

type LegendItem = {
  key: string
  label: string
  theme: { light: string; dark: string }
}

type AdminPiesProps = {
  rows: AdminRow[]
}

/** Created / won / lost split by admin; one admin keeps one color across the three pies. */
export function AdminPies({ rows }: AdminPiesProps) {
  const t = useTranslations("pipelines")

  const { model, config, legend } = useMemo(() => {
    const pieModel = buildAdminPieModel(rows, SLOT_COLORS.length)
    const legendItems: LegendItem[] = [
      ...pieModel.slotted.map((entry) => ({
        key: entry.key,
        label: entry.name,
        theme: SLOT_COLORS[entry.slot],
      })),
      ...(pieModel.hasOther
        ? [
            {
              key: OTHER_SLICE_KEY,
              label: t("analytics.pie.other"),
              theme: OTHER_COLOR,
            },
          ]
        : []),
    ]
    return {
      model: pieModel,
      config: Object.fromEntries(
        legendItems.map((item) => [
          item.key,
          { label: item.label, theme: item.theme },
        ]),
      ) satisfies ChartConfig,
      legend: legendItems,
    }
  }, [rows, t])

  return (
    <section className="grid gap-3 rounded-lg border bg-card p-3">
      <div className="grid gap-4 sm:grid-cols-3">
        {PIE_METRICS.map((metric) => {
          const slices = model.slices[metric.key]
          return (
            <figure
              aria-label={t(metric.titleKey)}
              className="flex flex-col items-center gap-2"
              key={metric.key}
            >
              <figcaption className="font-medium text-sm">
                {t(metric.titleKey)}
              </figcaption>
              {slices.length === 0 ? (
                <div className="m-2 flex size-32 items-center justify-center rounded-full border-[20px] border-muted text-center text-muted-foreground text-xs">
                  {t("analytics.pie.empty")}
                </div>
              ) : (
                <ChartContainer
                  className="aspect-square h-36 w-36"
                  config={config}
                >
                  <PieChart>
                    <ChartTooltip
                      content={<ChartTooltipContent hideLabel nameKey="key" />}
                    />
                    <Pie
                      data={slices}
                      dataKey="value"
                      innerRadius={PIE_INNER_RADIUS}
                      nameKey="key"
                      outerRadius={PIE_OUTER_RADIUS}
                      // The surface gap separates slices; a lone slice would show it as a notch.
                      stroke={slices.length > 1 ? "var(--card)" : "none"}
                      strokeWidth={2}
                    >
                      {slices.map((slice) => (
                        <Cell
                          fill={`var(--color-${slice.key})`}
                          key={slice.key}
                        />
                      ))}
                    </Pie>
                  </PieChart>
                </ChartContainer>
              )}
            </figure>
          )
        })}
      </div>
      {legend.length > 0 ? (
        <ul className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-muted-foreground text-xs">
          {legend.map((item) => (
            <li className="flex items-center gap-1.5" key={item.key}>
              {/* The legend sits outside the chart scope, so it reads the theme pair directly. */}
              <span
                aria-hidden
                className="size-2.5 rounded-sm dark:hidden"
                style={{ backgroundColor: item.theme.light }}
              />
              <span
                aria-hidden
                className="hidden size-2.5 rounded-sm dark:block"
                style={{ backgroundColor: item.theme.dark }}
              />
              {item.label}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
