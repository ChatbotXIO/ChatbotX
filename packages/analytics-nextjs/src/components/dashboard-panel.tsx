"use client"

import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import { Skeleton } from "@chatbotx.io/ui/components/ui/skeleton"
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

  if (status === "success") {
    return <>{children}</>
  }

  if (status === "error") {
    return (
      <Card className={className} role="status">
        <CardContent className="flex min-h-80 items-center justify-center">
          {t("states.error")}
        </CardContent>
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
