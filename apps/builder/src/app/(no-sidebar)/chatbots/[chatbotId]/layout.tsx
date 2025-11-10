import { redirect } from "next/navigation"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"

export default async function ChatbotNoSidebarLayout({
  params,
  children,
}: {
  params: Promise<{ chatbotId: string }>
  children: React.ReactNode
}) {
  const { chatbotId } = await params

  try {
    await assertCurrentUserCanAccessChatbot(chatbotId)
  } catch (_) {
    redirect("/")
  }

  return children
}
