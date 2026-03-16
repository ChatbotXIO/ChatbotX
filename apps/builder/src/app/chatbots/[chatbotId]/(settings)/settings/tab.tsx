"use client"

import { Tabs, TabsList, TabsTrigger } from "@aha.chat/ui/components/ui/tabs"
import Link from "next/link"
import { useParams, usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { useMemo } from "react"

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
    <Tabs defaultValue={activeTab}>
      <TabsList>
        {tabs.map((tab) => (
          <TabsTrigger asChild key={tab.value} value={tab.value}>
            <Link href={`/chatbots/${chatbotId}/settings/${tab.value}`}>
              {tab.label}
            </Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
