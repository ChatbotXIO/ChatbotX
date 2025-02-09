"use client"

import { Button } from "@/components/ui/button"
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
    <div className="flex gap-1 p-1 bg-muted w-full rounded-md">
      {tabs.map((tab) => (
        <Button
          key={tab.label}
          variant={activeTab === tab.value ? "outline" : "ghost"}
          asChild
          className="hover:bg-primary-foreground"
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
