import { Separator } from "@aha.chat/ui/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@aha.chat/ui/components/ui/sidebar"
import { cn } from "@aha.chat/ui/lib/utils"
import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { AppSidebar } from "@/components/app-sidebar"
import { getAllChatbotMembers } from "@/features/chatbot-members/queries"
import { getCurrentUserId } from "@/lib/auth"
import { findChatbotOrFail } from "@/lib/user-permissions"

export default async function ChatbotLayout({
  children,
  breadcrumb,
  params,
}: {
  children: React.ReactNode
  breadcrumb: React.ReactNode
  params: Promise<{ chatbotId: string }>
}) {
  const userId = await getCurrentUserId()
  const allParams = await params

  const headersList = await headers()
  const chatbotId = allParams.chatbotId

  const isInboxPage = (headersList.get("x-url") ?? "")
    .split("/")
    .includes("inbox")
  const requiredPadding = isInboxPage ? "" : "p-4"

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
        {!isInboxPage && (
          <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator className="mr-2 h-4" orientation="vertical" />
            {breadcrumb}
          </header>
        )}
        <main className={cn("flex flex-1 flex-col gap-4", requiredPadding)}>
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
