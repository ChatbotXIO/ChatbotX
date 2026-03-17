"use client"

import { Card, CardContent } from "@aha.chat/ui/components/ui/card"
import Link from "next/link"

type AppTabProps = {
  tabs: {
    label: string
    href: string
    isActive: boolean
  }[]
}

export function AppTab({ tabs }: AppTabProps) {
  return (
    <Card className="py-0">
      <CardContent className="flex items-center gap-8 px-8">
        {tabs.map((tab) => (
          <Link
            className={`border-b-2 py-6 text-sm ${tab.isActive ? "border-neutral-700 dark:border-white dark:text-gray-50" : "border-transparent font-medium text-gray-800 dark:text-gray-400"}`}
            href={tab.href}
            key={tab.href}
          >
            {tab.label}
          </Link>
        ))}
      </CardContent>
    </Card>
  )
}
