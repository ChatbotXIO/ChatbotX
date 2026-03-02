import { redirect } from "next/navigation"
import { getCurrentUserAndTargetChatbot } from "@/lib/auth/utils"
import { logger } from "@/lib/log"

export type ChatbotNoSidebarLayoutProps = {
  params: Promise<{ chatbotId: string }>
  children: React.ReactNode
}

export default async function ChatbotNoSidebarLayout({
  params,
  children,
}: ChatbotNoSidebarLayoutProps) {
  const { chatbotId } = await params

  const result = await getCurrentUserAndTargetChatbot(chatbotId)
  if (!result) {
    logger.debug(
      `User is not authenticated or does not have access to the chatbot ${chatbotId}`,
    )

    return redirect("/")
  }

  return children
}
