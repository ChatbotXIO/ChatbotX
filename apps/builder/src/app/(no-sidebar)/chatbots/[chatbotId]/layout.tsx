import { getCurrentUserId } from "@/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { redirect } from "next/navigation"

export default async function ChatbotNoSidebarLayout({
  params,
  children,
}: {
  params: Promise<{ chatbotId: string }>
  children: React.ReactNode
}) {
  const userId = await getCurrentUserId()
  const chatbotId = (await params).chatbotId

  try {
    await findChatbotOrFail(userId, chatbotId)
  } catch (_) {
    redirect("/")
  }

  return children
}
