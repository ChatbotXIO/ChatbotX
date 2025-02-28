import { getCurrentUserId } from "@/auth"
import { AppSidebar } from "@/components/app-sidebar"
import { cn } from "@/components/lib/utils"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { getAllChatbotMembers } from "@/features/chatbot-members/queries"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"

export default async function ChatbotLayout({
  children,
  breadcrumb,
  params,
}: {
  children: React.ReactNode
  breadcrumb: React.ReactNode
  params: Promise<{ chatbotId: string; all: string[] }>
}) {
  const userId = await getCurrentUserId()
  const allParams = await params

  const headersList = await headers()
  const chatbotId = allParams.chatbotId
  const requiredPadding = headersList.get("x-url")?.includes("/inbox")
    ? ""
    : "p-4"

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
        chatbotId={chatbotId}
        allChatbotsPromise={allChatbotsPromise}
      />
      <SidebarInset>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          {breadcrumb}
        </header>
        <main className={cn("flex flex-1 flex-col gap-4", requiredPadding)}>
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
