"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import Link from "next/link"
import { usePathname } from "next/navigation"

export function SettingsTab() {
  const tabs = [
    {
      label: "settings.tab.general",
      value: "general",
    },
    {
      label: "settings.tab.channels",
      value: "channels",
    },
    {
      label: "settings.tab.integrations",
      value: "integrations",
    },
    {
      label: "settings.tab.admins",
      value: "admins",
    },
    {
      label: "settings.tab.billing",
      value: "billing",
    },
  ]

  const pathname = usePathname()
  const activeTab = pathname.split("/").pop()

  return (
    <div className="flex w-full flex-wrap gap-1 rounded-md bg-muted p-1">
      {tabs.map((tab) => (
        <Button
          asChild
          className="hover:bg-primary-foreground"
          key={tab.label}
          variant={activeTab === tab.value ? "outline" : "ghost"}
        >
          {activeTab === tab.value ? (
            <span className="cursor-pointer">{tab.label}</span>
          ) : (
            <Link href={tab.value} replace>
              {tab.label}
            </Link>
          )}
        </Button>
      ))}
    </div>
  )
}
