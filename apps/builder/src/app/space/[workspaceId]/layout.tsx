import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@chatbotx.io/ui/components/ui/sidebar"
import { getIdFromParams } from "@chatbotx.io/utils"
import { cookies } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { AppSidebar } from "@/components/app-sidebar"
import { getAllWorkspaceMembers } from "@/features/workspace-members/queries"
import { getCurrentUserId } from "@/lib/auth/utils"
import { findChatbotOrFail } from "@/lib/user-permissions"

export default async function ChatbotLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ workspaceId: string }>
}) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const userId = await getCurrentUserId()
  if (!userId) {
    return notFound()
  }

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

        <main className="flex flex-1 flex-col gap-4 p-6">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  )
}
