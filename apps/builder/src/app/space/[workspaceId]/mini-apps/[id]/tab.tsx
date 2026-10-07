"use client"

import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { AppTab } from "@/components/app-tab"
import { useWorkspaceId } from "@/hooks/routing"

export function MiniAppTab({ miniAppId }: { miniAppId: string }) {
  const t = useTranslations()
  const pathname = usePathname()
  const workspaceId = useWorkspaceId()

  const tabs = useMemo(
    () => [
      { label: t("actions.edit"), value: "edit" },
      { label: t("miniApps.submissions.title"), value: "submissions" },
    ],
    [t],
  )
  const activeTab = useMemo(() => {
    const segments = pathname.split("/")
    const index = segments.indexOf(miniAppId)
    return index === -1 ? undefined : segments[index + 1]
  }, [pathname, miniAppId])

  return (
    <AppTab
      tabs={tabs.map((tab) => ({
        label: tab.label,
        href: `/space/${workspaceId}/mini-apps/${miniAppId}/${tab.value}`,
        isActive: activeTab === tab.value,
      }))}
    />
  )
}
