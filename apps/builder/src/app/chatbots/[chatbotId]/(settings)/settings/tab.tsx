"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { useMemo } from "react"

export function SettingsTab() {
  const t = useTranslations()
  const pathname = usePathname()

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
    <nav
      aria-label="Settings navigation"
      className="flex w-full flex-wrap gap-1 rounded-md bg-muted p-1"
    >
      {tabs.map((tab) => {
        const isActive = activeTab === tab.value

        return (
          <Button
            aria-current={isActive ? "page" : undefined}
            asChild
            className="hover:bg-primary-foreground"
            key={tab.value}
            variant={isActive ? "outline" : "ghost"}
          >
            {isActive ? (
              <span className="cursor-pointer">{tab.label}</span>
            ) : (
              <Link href={tab.value} replace>
                {tab.label}
              </Link>
            )}
          </Button>
        )
      })}
    </nav>
  )
}
