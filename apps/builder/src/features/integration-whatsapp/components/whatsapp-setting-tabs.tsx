"use client"

import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { memo, useMemo } from "react"
import { AppTab } from "@/components/app-tab"

type TabConfig = {
  readonly value: string
  readonly translationKey: string
}

const TAB_CONFIGS: readonly TabConfig[] = [
  {
    value: "useful-links",
    translationKey: "whatsapp.tabs.usefulLinks",
  },
  {
    value: "profile",
    translationKey: "whatsapp.tabs.profile",
  },
  {
    value: "message-templates",
    translationKey: "whatsapp.tabs.messageTemplates",
  },
  {
    value: "automation",
    translationKey: "whatsapp.tabs.automation",
  },
  {
    value: "flows",
    translationKey: "whatsapp.tabs.flows",
  },
  {
    value: "ecommerce",
    translationKey: "whatsapp.tabs.ecommerce",
  },
] as const

export const WhatsappSettingTabs = memo(
  function WhatsappSettingTabsComponent() {
    const t = useTranslations()
    const pathname = usePathname()

    const activeTab = useMemo(() => pathname.split("/").pop() ?? "", [pathname])

    const basePath = useMemo(() => {
      const segments = pathname.split("/").filter(Boolean)
      const lastSegment = segments.at(-1)

      if (lastSegment && TAB_CONFIGS.some((tab) => tab.value === lastSegment)) {
        return `/${segments.slice(0, -1).join("/")}`
      }

      return `/${segments.join("/")}`
    }, [pathname])

    return (
      <AppTab
        tabs={TAB_CONFIGS.map((tab) => ({
          label: t(tab.translationKey),
          href: `${basePath}/${tab.value}`,
          isActive: activeTab === tab.value,
        }))}
      />
    )
  },
)
