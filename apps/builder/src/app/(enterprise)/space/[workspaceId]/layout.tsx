import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@chatbotx.io/ui/components/ui/sidebar"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { getIdFromParams } from "@chatbotx.io/utils"
import { cookies, headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { AppSidebar } from "@/components/app-sidebar"
import { getAllWorkspaceMembers } from "@/features/workspace-members/queries"
import { getCurrentUserId } from "@/lib/auth/utils"
import { findChatbotOrFail } from "@/lib/user-permissions"

const INBOX_PAGE_REGEX =
  /\/space\/[a-z0-9]+\/inbox(?:\?conversationId=[a-z0-9]+)?$/

type ChatbotLayoutProps = {
  children: React.ReactNode
  params: Promise<{ workspaceId: string }>
}

export default async function ChatbotLayout({
  children,
  params,
}: ChatbotLayoutProps) {
  const userId = await getCurrentUserId()
  if (!userId) {
    return notFound()
  }

  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const headersList = await headers()

  const isInboxPage = INBOX_PAGE_REGEX.test(headersList.get("x-url") ?? "")
  const requiredPadding = isInboxPage ? "" : "p-6"

  const allChatbotsPromise = getAllWorkspaceMembers(userId)

  try {
    await findChatbotOrFail(userId, workspaceId)
  } catch (_e) {
    redirect("/")
  }

  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get("sidebar_state")?.value === "true"

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar
        allChatbotsPromise={allChatbotsPromise}
        workspaceId={workspaceId}
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
