"use client"

import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { AppTab } from "@/components/app-tab"
import { useWorkspaceId } from "@/hooks/routing"

export function MinigameTab({ minigameId }: { minigameId: string }) {
  const t = useTranslations()
  const pathname = usePathname()
  const workspaceId = useWorkspaceId()

  const tabs = useMemo(
    () => [
      { label: t("actions.edit"), value: "edit" },
      { label: t("minigames.history.title"), value: "history" },
    ],
    [t],
  )

  const activeTab = useMemo(() => {
    const segments = pathname.split("/")
    const minigameIndex = segments.indexOf(minigameId)
    return minigameIndex === -1 ? undefined : segments[minigameIndex + 1]
  }, [pathname, minigameId])

  return (
    <AppTab
      tabs={tabs.map((tab) => ({
        label: tab.label,
        href: `/space/${workspaceId}/minigames/${minigameId}/${tab.value}`,
        isActive: activeTab === tab.value,
      }))}
    />
  )
}
