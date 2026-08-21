"use client"

import { Card, CardContent } from "@chatbotx.io/ui/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import Link from "next/link"

type AppTabProps = {
  tabs: {
    label: string
    href: string
    isActive: boolean
    disabled?: boolean
    disabledPresentation?: "muted" | "normal"
    disabledTooltip?: string
  }[]
}

function getTabClassName(tab: AppTabProps["tabs"][number]) {
  const base = "border-b-2 py-6 text-sm"
  if (tab.disabled) {
    const disabledPresentation =
      tab.disabledPresentation === "normal"
        ? "text-gray-800 dark:text-gray-400"
        : "text-gray-400 opacity-60 dark:text-gray-500"
    return `${base} cursor-not-allowed border-transparent font-medium ${disabledPresentation}`
  }
  if (tab.isActive) {
    return `${base} border-neutral-700 dark:border-white dark:text-gray-50`
  }
  return `${base} border-transparent font-medium text-gray-800 dark:text-gray-400`
}

export function AppTab({ tabs }: AppTabProps) {
  return (
    <Card className="py-0">
      <CardContent className="flex items-center gap-8 px-8">
        {tabs.map((tab) =>
          tab.disabled ? (
            <Tooltip key={tab.href}>
              <TooltipTrigger
                render={
                  <span
                    aria-disabled="true"
                    className={getTabClassName(tab)}
                    title={tab.disabledTooltip}
                  >
                    {tab.label}
                  </span>
                }
              />
              {tab.disabledTooltip ? (
                <TooltipContent>{tab.disabledTooltip}</TooltipContent>
              ) : null}
            </Tooltip>
          ) : (
            <Link
              className={getTabClassName(tab)}
              href={tab.href}
              key={tab.href}
            >
              {tab.label}
            </Link>
          ),
        )}
      </CardContent>
    </Card>
  )
}
