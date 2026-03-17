"use client"

import { useParams, usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { useMemo } from "react"
import { AppTab } from "@/components/app-tab"

export function SettingsTab() {
  const t = useTranslations()
  const pathname = usePathname()

  const { chatbotId } = useParams<{ chatbotId: string }>()

  const tabs = useMemo(
    () => [
      {
        label: t("general.title"),
        value: "general",
      },
      {
        label: t("channels.title"),
        value: "channels",
      },
      {
        label: t("integrations.title"),
        value: "integrations",
      },
      {
        label: t("admins.title"),
        value: "admins",
      },
      {
        label: t("inboxTeams.title"),
        value: "inbox-teams",
      },
      {
        label: t("billing.title"),
        value: "billing",
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
        href: `/chatbots/${chatbotId}/settings/${tab.value}`,
        isActive: activeTab === tab.value,
      }))}
    />
  )
}
