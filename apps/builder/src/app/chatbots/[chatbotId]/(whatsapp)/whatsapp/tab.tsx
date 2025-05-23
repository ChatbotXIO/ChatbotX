"use client"

import { Button } from "@/components/ui/button"
import Link from "next/link"
import { usePathname } from "next/navigation"

export function SettingsTab() {
  const tabs = [
    {
      label: "whatsapp.tab.usefulLink",
      value: "useful-links",
    },
    {
      label: "whatsapp.tab.profile",
      value: "profile",
    },
    {
      label: "whatsapp.tab.messageTemplates",
      value: "message-templates",
    },
    {
      label: "whatsapp.tab.conversationStarters",
      value: "ice-breakers",
    },
    {
      label: "whatsapp.tab.flows",
      value: "flows",
    },
    {
      label: "whatsapp.tab.ecommerce",
      value: "ecommerce",
    },
  ]

  const pathname = usePathname()
  const activeTab = pathname.split("/").pop()

  return (
    <div className="flex flex-wrap gap-1 p-1 bg-muted w-full rounded-md">
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
