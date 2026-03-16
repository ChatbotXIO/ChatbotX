"use client"

import { useParams, usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { AppTab } from "@/components/app-tab"

export function AITab() {
  const { chatbotId } = useParams<{ chatbotId: string }>()
  const t = useTranslations()

  const pathname = usePathname()
  const activeTab = pathname.split("/").pop()

  return (
    <AppTab
      tabs={[
        {
          label: t("aiAgent.name"),
          href: `/chatbots/${chatbotId}/ai-agents`,
          isActive: activeTab === "ai-agents",
        },
        {
          label: t("aiFiles.title"),
          href: `/chatbots/${chatbotId}/ai-files`,
          isActive: activeTab === "ai-files",
        },
        {
          label: t("aiFunctions.title"),
          href: `/chatbots/${chatbotId}/ai-functions`,
          isActive: activeTab === "ai-functions",
        },
        {
          label: t("aiMcpServers.title"),
          href: `/chatbots/${chatbotId}/ai-mcp-servers`,
          isActive: activeTab === "ai-mcp-servers",
        },
      ]}
    />
  )
}
