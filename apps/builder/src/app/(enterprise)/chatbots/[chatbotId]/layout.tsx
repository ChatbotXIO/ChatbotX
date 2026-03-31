import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@aha.chat/ui/components/ui/sidebar"
import { cn } from "@aha.chat/ui/lib/utils"
import { parseBigIntId } from "@chatbotx.io/utils"
import { cookies, headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { AppSidebar } from "@/components/app-sidebar"
import { getAllChatbotMembers } from "@/features/chatbot-members/queries"
import { getCurrentUserId } from "@/lib/auth/utils"
import { findChatbotOrFail } from "@/lib/user-permissions"

const INBOX_PAGE_REGEX =
  /\/chatbots\/[a-z0-9]+\/inbox(?:\?conversationId=[a-z0-9]+)?$/

type ChatbotLayoutProps = {
  children: React.ReactNode
  params: Promise<{ chatbotId: string }>
}

export default async function ChatbotLayout({
  children,
  params,
}: ChatbotLayoutProps) {
  const userId = await getCurrentUserId()
  if (!userId) {
    return notFound()
  }

  const { chatbotId: chatbotIdString } = await params
  const chatbotId = parseBigIntId(chatbotIdString)
  if (!chatbotId) {
    return notFound()
  }

  const headersList = await headers()

  const isInboxPage = INBOX_PAGE_REGEX.test(headersList.get("x-url") ?? "")
  const requiredPadding = isInboxPage ? "" : "p-6"

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
        <main className={cn("flex flex-1 flex-col gap-4", requiredPadding)}>
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
