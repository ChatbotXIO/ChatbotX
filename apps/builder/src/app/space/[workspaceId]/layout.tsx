import {
  organizationService,
  workspaceMemberService,
} from "@chatbotx.io/business"
import {
  SidebarInset,
  SidebarProvider,
} from "@chatbotx.io/ui/components/ui/sidebar"
import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { AppSidebar } from "@/components/app-sidebar"
import { SettingsAreaSidebar } from "@/components/settings-area-sidebar"
import { getCurrentUserId } from "@/lib/auth/utils"
import { getDomainFromHeader } from "@/lib/domain"

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

  const userId = await getCurrentUserId()
  if (!userId) {
    return notFound()
  }

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

  const domain = await getDomainFromHeader()
  let organization: Awaited<
    ReturnType<typeof organizationService.findByDomain>
  > | null = null
  try {
    organization = await organizationService.findByDomain(domain)
  } catch {
    organization = null
  }

  return (
    <SidebarProvider open={false}>
      <AppSidebar
        allWorkspaces={allWorkspaces}
        organization={
          organization ? { id: organization.id, name: organization.name } : null
        }
        workspaceId={workspaceId}
      />
      <SidebarInset>
        <div className="flex flex-1">
          <SettingsAreaSidebar />
          <main className="flex flex-1 flex-col gap-4 overflow-auto p-6">
            {children}
          </main>
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
