"use client"

import { Button } from "@aha.chat/ui/components/ui/button"
import Link from "next/link"
import { useParams, usePathname } from "next/navigation"
import { useTranslations } from "next-intl"

export function AIHubBreadcrumb() {
  const { chatbotId } = useParams<{ chatbotId: string }>()
  const t = useTranslations()

  const pathname = usePathname()
  const activeTab = pathname.split("/").pop()

  return (
    <div className="w-full">
      <div className="grid w-full grid-cols-4 gap-2 rounded-lg bg-muted p-1">
        <Button
          asChild
          className="hover:bg-background"
          variant={activeTab === "ai-agents" ? "outline" : "ghost"}
        >
          <Link href={`/chatbots/${chatbotId}/ai-agents`}>
            {t("aiAgent.title")}
          </Link>
        </Button>
        <Button
          asChild
          className="hover:bg-background"
          variant={activeTab === "ai-files" ? "outline" : "ghost"}
        >
          <Link href={`/chatbots/${chatbotId}/ai-files`}>
            {t("aiFiles.title")}
          </Link>
        </Button>
        <Button
          asChild
          className="hover:bg-background"
          variant={activeTab === "ai-functions" ? "outline" : "ghost"}
        >
          <Link href={`/chatbots/${chatbotId}/ai-functions`}>
            {t("aiFunctions.title")}
          </Link>
        </Button>
        <Button
          asChild
          className="hover:bg-background"
          variant={activeTab === "ai-mcp-servers" ? "outline" : "ghost"}
        >
          <Link href={`/chatbots/${chatbotId}/ai-mcp-servers`}>
            {t("aiMcpServers.title")}
          </Link>
        </Button>
      </div>
    </div>
  )
}
