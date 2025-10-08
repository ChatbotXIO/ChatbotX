"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { memo, useMemo } from "react"

type TabConfig = {
  readonly label: string
  readonly value: string
  readonly translationKey: string
}

const TAB_CONFIGS: readonly TabConfig[] = [
  {
    label: "usefulLinks",
    value: "useful-links",
    translationKey: "whatsapp.tabs.usefulLinks",
  },
  {
    label: "profile",
    value: "profile",
    translationKey: "whatsapp.tabs.profile",
  },
  {
    label: "messageTemplates",
    value: "message-templates",
    translationKey: "whatsapp.tabs.messageTemplates",
  },
  {
    label: "automation",
    value: "automation",
    translationKey: "whatsapp.tabs.automation",
  },
  {
    label: "flows",
    value: "flows",
    translationKey: "whatsapp.tabs.flows",
  },
  {
    label: "ecommerce",
    value: "ecommerce",
    translationKey: "whatsapp.tabs.ecommerce",
  },
] as const

function TabButton({
  tab,
  isActive,
  t,
}: {
  tab: TabConfig & { label: string }
  isActive: boolean
  t: (key: string) => string
}) {
  const label = t(tab.translationKey)

  return (
    <Button
      aria-current={isActive ? "page" : undefined}
      aria-label={`Navigate to ${label}`}
      asChild
      className="transition-colors hover:bg-primary-foreground"
      variant={isActive ? "outline" : "ghost"}
    >
      {isActive ? (
        <span className="cursor-default">{label}</span>
      ) : (
        <Link aria-label={`Go to ${label} settings`} href={tab.value} replace>
          {label}
        </Link>
      )}
    </Button>
  )
}

export const WhatsappSettingTabs = memo(
  function WhatsappSettingTabsComponent() {
    const t = useTranslations()
    const pathname = usePathname()

    const activeTab = useMemo(() => pathname.split("/").pop() ?? "", [pathname])

    const tabs = useMemo(
      () =>
        TAB_CONFIGS.map((tab) => ({
          ...tab,
          label: t(tab.translationKey),
        })),
      [t],
    )

    return (
      <nav
        aria-label="WhatsApp settings navigation"
        className="flex w-full flex-wrap gap-1 rounded-md bg-muted p-1"
      >
        {tabs.map((tab) => (
          <TabButton
            isActive={activeTab === tab.value}
            key={tab.value}
            t={t}
            tab={tab}
          />
        ))}
      </nav>
    )
  },
)
