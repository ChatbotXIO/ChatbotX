import {
  isPlatformAdmin,
  userQuotaService,
  workspaceMemberService,
} from "@chatbotx.io/business"
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "@chatbotx.io/ui/components/ui/sidebar"
import { getIdFromParams } from "@chatbotx.io/utils"
import { cookies } from "next/headers"
import { notFound } from "next/navigation"
import { AppSidebar } from "@/components/app-sidebar"
import type { QuotaMetric, QuotaSummary } from "@/components/nav-usage"
import { isCloud } from "@/env"
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

  // Plan + usage limits only apply to the hosted cloud edition. Self-hosted
  // community/enterprise installs use every feature freely — no quota gating.
  const cloud = isCloud()

  // Check if user is a member of the workspace
  const [allWorkspaceMembers, { storageUrl }, platformAdmin, quota] =
    await Promise.all([
      workspaceMemberService.listByUserId({ userId: user.id }),
      getTenantSettings(),
      isPlatformAdmin(user),
      cloud ? userQuotaService.getForUser(user.id) : Promise.resolve(null),
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

  const metrics: QuotaMetric[] = quota
    ? (
        [
          {
            key: "contacts",
            used: quota.contactsUsed,
            limit: quota.contactsLimit,
          },
          {
            key: "workspaces",
            used: quota.workspacesUsed,
            limit: quota.workspacesLimit,
          },
          {
            key: "channels",
            used: quota.channelsUsed,
            limit: quota.channelsLimit,
          },
          {
            key: "teamMembers",
            used: quota.teamMembersUsed,
            limit: quota.teamMembersLimit,
          },
        ] as const
      ).flatMap((metric) =>
        typeof metric.limit === "number"
          ? [{ key: metric.key, used: metric.used, limit: metric.limit }]
          : [],
      )
    : []

  const quotaSummary: QuotaSummary = {
    planName: quota?.planName ?? null,
    planStatus: quota?.planStatus ?? null,
    metrics,
  }

  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get("sidebar_state")?.value === "true"

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar
        allWorkspaces={allWorkspaces}
        isPlatformAdmin={platformAdmin}
        quota={quotaSummary}
        workspaceId={workspaceId}
      />
      <SidebarInset>
        <main className="flex flex-1 flex-col gap-4 p-6">{children}</main>
        <SidebarTrigger className="absolute top-3 -left-2 z-10 border" />
      </SidebarInset>
    </SidebarProvider>
  )
}
