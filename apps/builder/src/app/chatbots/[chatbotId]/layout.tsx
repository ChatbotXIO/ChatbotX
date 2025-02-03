import { getCurrentUserId } from "@/auth"
import { AppSidebar } from "@/components/app-sidebar"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { getAllChatbotsOfUser } from "@/features/chatbots/queries"
import { findChatbotOrFail } from "@/lib/user-permissions"
import { redirect } from "next/navigation"

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
  const chatbotId = (await params).chatbotId
  const allChatbotsPromise = getAllChatbotsOfUser(userId)

  try {
    await findChatbotOrFail(userId, chatbotId)
  } catch (e) {
    redirect("/")
  }

  return (
    <SidebarProvider>
      <AppSidebar
        chatbotId={chatbotId}
        allChatbotsPromise={allChatbotsPromise}
      />
      <SidebarInset>
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <SidebarTrigger className="-ml-1" />
          <Separator orientation="vertical" className="mr-2 h-4" />
          {breadcrumb}
        </header>
        <main className="flex flex-1 flex-col gap-4 p-4">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
