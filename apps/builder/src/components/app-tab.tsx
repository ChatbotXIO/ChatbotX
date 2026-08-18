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
  // `shrink-0` + `whitespace-nowrap` keep each tab at its natural width so
  // the strip overflows (and scrolls) instead of squeezing labels.
  const base = "shrink-0 whitespace-nowrap border-b-2 py-4 text-sm md:py-6"
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
      {/*
        Several surfaces render 5-6 tabs, which cannot fit a phone. Scrolling
        the strip keeps every tab reachable without pushing the page itself
        into horizontal overflow. The scrollbar is hidden because the strip
        sits directly under a card edge, where a persistent bar reads as a
        rendering artefact; touch scrolling needs no visible track.
      */}
      <CardContent className="flex flex-nowrap items-center gap-4 overflow-x-auto px-4 [-ms-overflow-style:none] [scrollbar-width:none] md:gap-8 md:px-8 [&::-webkit-scrollbar]:hidden">
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
