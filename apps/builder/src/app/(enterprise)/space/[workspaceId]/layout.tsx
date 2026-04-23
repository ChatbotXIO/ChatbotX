import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@chatbotx.io/ui/components/ui/sidebar"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { getIdFromParams } from "@chatbotx.io/utils"
import { cookies } from "next/headers"
import { notFound } from "next/navigation"
import { AppSidebar } from "@/components/app-sidebar"
import { workspaceMemberService } from "@/features/workspace-members/workspace-member-service"
import { getCurrentUserId } from "@/lib/auth/utils"
import { getOriginUrlFromHeader } from "@/lib/domain"

const INBOX_PAGE_REGEX =
  /\/space\/[a-z0-9]+\/inbox(?:\?conversationId=[a-z0-9]+)?$/

type WorkspaceLayoutProps = {
  children: React.ReactNode
  params: Promise<{ workspaceId: string }>
}

export default async function WorkspaceLayout({
  children,
  params,
}: WorkspaceLayoutProps) {
  const userId = await getCurrentUserId()
  if (!userId) {
    return notFound()
  }

  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const originUrl = await getOriginUrlFromHeader()
  const isInboxPage = INBOX_PAGE_REGEX.test(originUrl)
  const requiredPadding = isInboxPage ? "" : "p-6"

  // Check if user is a member of the workspace
  const allWorkspaceMembers = await workspaceMemberService.listByUserId({
    userId,
  })
  if (
    !allWorkspaceMembers.some(
      (workspaceMember) => workspaceMember.workspace.id === workspaceId,
    )
  ) {
    return notFound()
  }

  const allWorkspaces = allWorkspaceMembers.map(
    (workspaceMember) => workspaceMember.workspace,
  )

  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get("sidebar_state")?.value === "true"

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar allWorkspaces={allWorkspaces} workspaceId={workspaceId} />
      <SidebarInset>
        <SidebarTrigger className="absolute top-3 -left-2 z-10 border" />
        <main className={cn("flex flex-1 flex-col gap-4", requiredPadding)}>
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}
