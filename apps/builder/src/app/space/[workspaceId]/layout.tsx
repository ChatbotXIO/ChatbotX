import { isPlatformAdmin, workspaceMemberService } from "@chatbotx.io/business"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@chatbotx.io/ui/components/ui/sidebar"
import { getIdFromParams } from "@chatbotx.io/utils"
import { cookies } from "next/headers"
import { notFound } from "next/navigation"
import { AppSidebar } from "@/components/app-sidebar"
import { getTenantSettings } from "@/features/tenant/utils"
import { getCurrentUser } from "@/lib/auth/utils"

export default async function WorkspaceLayout({
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

  const user = await getCurrentUser()
  if (!user) {
    return notFound()
  }

  // Check if user is a member of the workspace
  const [allWorkspaceMembers, { storageUrl }, platformAdmin] =
    await Promise.all([
      workspaceMemberService.listByUserId({ userId: user.id }),
      getTenantSettings(),
      isPlatformAdmin(user),
    ])
  if (
    !allWorkspaceMembers.some(
      (workspaceMember) => workspaceMember.workspace.id === workspaceId,
    )
  ) {
    return notFound()
  }

  const allWorkspaces = allWorkspaceMembers.map((workspaceMember) => ({
    ...workspaceMember.workspace,
    logo: workspaceMember.workspace.logo
      ? new URL(workspaceMember.workspace.logo, storageUrl).toString()
      : null,
  }))

  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get("sidebar_state")?.value === "true"

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar
        allWorkspaces={allWorkspaces}
        isPlatformAdmin={platformAdmin}
        workspaceId={workspaceId}
      />
      <SidebarInset>
        <main className="flex flex-1 flex-col gap-4 p-6">{children}</main>
        <SidebarTrigger className="absolute top-3 -left-2 z-10 border" />
      </SidebarInset>
    </SidebarProvider>
  )
}
