"use client"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { AppTab } from "@/components/app-tab"
import { useWorkspaceId } from "@/hooks/routing"

export function AITab() {
  const workspaceId = useWorkspaceId()

  const t = useTranslations()

  const pathname = usePathname()
  // The section is the segment after /space/{workspaceId}, so nested pages
  // such as /ai-files/{id} keep their tab lit.
  const segments = pathname.split("/")
  const activeTab = segments[segments.indexOf("space") + 2]

  return (
    <AppTab
      tabs={[
        {
          label: t("aiAgent.name"),
          href: `/space/${workspaceId}/ai-agents`,
          isActive: activeTab === "ai-agents",
        },
        {
          label: t("aiFiles.title"),
          href: `/space/${workspaceId}/ai-files`,
          isActive: activeTab === "ai-files",
        },
        {
          label: t("aiFunctions.title"),
          href: `/space/${workspaceId}/ai-functions`,
          isActive: activeTab === "ai-functions",
        },
        {
          label: t("aiMcpServers.title"),
          href: `/space/${workspaceId}/ai-mcp-servers`,
          isActive: activeTab === "ai-mcp-servers",
        },
      ]}
    />
  )
}
