"use client"

import { ChartCardProvider } from "@chatbotx.io/ui/components/charts/chart-card-context"
import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"
import type { DashboardLoadAction } from "../provider/analysis-store"
import { useAnalysisStore } from "../provider/analysis-store-context"

type DashboardPanelProps = {
  action: DashboardLoadAction
  children: ReactNode
  className?: string
}

export const DashboardPanel = ({
  action,
  children,
  className,
}: DashboardPanelProps) => {
  const t = useTranslations()
  const status = useAnalysisStore((state) => state.dashboardLoadStatus[action])

  if (status === "error") {
    return (
      <Card className={className} role="status">
        <CardContent className="flex min-h-80 items-center justify-center">
          {t("states.error")}
        </CardContent>
      </Card>
    )
  }

  if (status === "success" || status === "refreshing") {
    // Keep the previous numbers while a new range or filter loads, but dim them
    // so they are not mistaken for the result of the change.
    const isRefreshing = status === "refreshing"
    return (
      <Card
        className={cn(
          className,
          isRefreshing && "opacity-50 transition-opacity",
        )}
        data-refreshing={isRefreshing || undefined}
      >
        <ChartCardProvider>{children}</ChartCardProvider>
      </Card>
    )
  }

  return (
    <Card
      aria-busy="true"
      aria-label={t("actions.loading")}
      className={className}
    >
      <CardContent className="flex min-h-80 flex-col gap-6">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="min-h-48 flex-1" />
      </CardContent>
    </Card>
  )
}
