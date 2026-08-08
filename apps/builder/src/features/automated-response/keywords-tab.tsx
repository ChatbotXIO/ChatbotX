"use client"

import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { AppTab } from "@/components/app-tab"
import { useWorkspaceId } from "@/hooks/routing"

export function KeywordsTab() {
  const t = useTranslations()
  const pathname = usePathname()
  const workspaceId = useWorkspaceId()

  const tabs = useMemo(
    () => [
      {
        label: t("keywords.tabs.contact"),
        value: "automated-responses",
      },
      {
        label: t("keywords.tabs.page"),
        value: "page-automated-responses",
      },
    ],
    [t],
  )

  const activeTab = useMemo(() => {
    const segments = pathname.split("/")
    return segments.at(-1)
  }, [pathname])

  return (
    <AppTab
      tabs={tabs.map((tab) => ({
        label: tab.label,
        href: `/space/${workspaceId}/${tab.value}`,
        isActive: activeTab === tab.value,
      }))}
    />
  )
}
