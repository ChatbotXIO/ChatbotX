import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@chatbotx.io/ui/components/ui/sidebar"
import { getIdFromParams } from "@chatbotx.io/utils"
import { cookies } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { AppSidebar } from "@/components/app-sidebar"
import { getAllChatbotMembers } from "@/features/chatbot-members/queries"
import { getCurrentUserId } from "@/lib/auth/utils"
import { findChatbotOrFail } from "@/lib/user-permissions"

export default async function ChatbotLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ chatbotId: string }>
}) {
  const chatbotId = getIdFromParams(await params, "chatbotId")
  if (!chatbotId) {
    return notFound()
  }

  const userId = await getCurrentUserId()
  if (!userId) {
    return notFound()
  }

  const allChatbotsPromise = getAllChatbotMembers(userId)

  try {
    await findChatbotOrFail(userId, chatbotId)
  } catch (_e) {
    redirect("/")
  }

  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get("sidebar_state")?.value === "true"

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar
        allChatbotsPromise={allChatbotsPromise}
        chatbotId={chatbotId}
      />
      <SidebarInset>
        <SidebarTrigger className="absolute top-3 -left-2 z-10 border" />

        <main className="flex flex-1 flex-col gap-4 p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
