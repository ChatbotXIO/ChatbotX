import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound, redirect } from "next/navigation"
import type { ReactNode } from "react"
import { getCurrentUserAndTargetChatbot } from "@/lib/auth/utils"
import { logger } from "@/lib/log"

export type ChatbotNoSidebarLayoutProps = {
  params: Promise<{ chatbotId: string }>
  children: ReactNode
}

export default async function ChatbotNoSidebarLayout({
  params,
  children,
}: ChatbotNoSidebarLayoutProps) {
  const chatbotId = getIdFromParams(await params, "chatbotId")
  if (!chatbotId) {
    return notFound()
  }

  const result = await getCurrentUserAndTargetChatbot(chatbotId)
  if (!result) {
    logger.debug(
      `User is not authenticated or does not have access to the chatbot ${chatbotId}`,
    )

    return redirect("/")
  }

  return children
}
