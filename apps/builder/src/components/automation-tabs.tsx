"use client"

import { Tabs, TabsList, TabsTrigger } from "@chatbotx.io/ui/components/ui/tabs"
import Link from "next/link"
import { useParams, usePathname } from "next/navigation"
import { useTranslations } from "next-intl"

type AutomationTab = {
  value: "automated-responses" | "broadcasts" | "sequences"
  labelKey: "keywords.title" | "broadcasts.title" | "sequences.title"
}

const TABS: AutomationTab[] = [
  { value: "automated-responses", labelKey: "keywords.title" },
  { value: "broadcasts", labelKey: "broadcasts.title" },
  { value: "sequences", labelKey: "sequences.title" },
]

export function AutomationTabs() {
  const t = useTranslations()
  const pathname = usePathname()
  const params = useParams()
  const workspaceId = params.workspaceId as string

  const base = `/space/${workspaceId}`
  const activeTab =
    TABS.find((tab) => pathname.startsWith(`${base}/${tab.value}`))?.value ??
    TABS[0].value

  return (
    <Tabs className="w-full" value={activeTab}>
      <TabsList>
        {TABS.map((tab) => (
          <Link href={`${base}/${tab.value}`} key={tab.value} passHref>
            <TabsTrigger value={tab.value}>{t(tab.labelKey)}</TabsTrigger>
          </Link>
        ))}
      </TabsList>
    </Tabs>
  )
}
