import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound, redirect } from "next/navigation"
import type { ReactNode } from "react"
import { getCurrentUserAndTargetChatbot } from "@/lib/auth/utils"
import { logger } from "@/lib/log"

export type ChatbotNoSidebarLayoutProps = {
  params: Promise<{ workspaceId: string }>
  children: ReactNode
}

export default async function ChatbotNoSidebarLayout({
  params,
  children,
}: ChatbotNoSidebarLayoutProps) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const result = await getCurrentUserAndTargetChatbot(workspaceId)
  if (!result) {
    logger.debug(
      `User is not authenticated or does not have access to the workspace ${workspaceId}`,
    )

    return redirect("/")
  }

  return children
}
