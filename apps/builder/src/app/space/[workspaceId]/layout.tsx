import {
  isPlatformAdmin,
  isSuperAdmin,
  quotaEnforcementService,
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
import { ExpiredBanner } from "@/components/expired-banner"
import type { QuotaSummary } from "@/components/nav-usage"
import { ScheduledDeletionBanner } from "@/components/scheduled-deletion-banner"
import { isCloud } from "@/env"
import { getTenantSettings } from "@/features/tenant/utils"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"
import { enforcePasswordCurrent } from "@/lib/auth/require-password-current"
import { getCurrentUser } from "@/lib/auth/utils"
import { getOriginUrlFromHeader } from "@/lib/domain"
import {
  buildQuotaMetrics,
  isBlockedFromPlan,
  resolveTrialEndsAt,
} from "@/lib/quota-metrics"
import { enforceWorkspaceNotScheduledForDeletion } from "@/lib/workspace/require-not-scheduled-for-deletion"

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

  enforcePasswordCurrent(user)

  // Plan + usage limits only apply to the hosted cloud edition. Self-hosted
  // community/enterprise installs use every feature freely — no quota gating.
  const cloud = isCloud()

  // Check if user is a member of the workspace
  const [allWorkspaceMembers, { storageUrl }, platformAdmin, quota, usage] =
    await Promise.all([
      workspaceMemberService.listByUserId({ userId: user.id }),
      getTenantSettings(),
      isPlatformAdmin(user),
      cloud ? userQuotaService.getForUser(user.id) : Promise.resolve(null),
      cloud ? quotaEnforcementService.getUsageSummary(user.id) : null,
    ])
  const targetWorkspaceMember = allWorkspaceMembers.find(
    (workspaceMember) => workspaceMember.workspace.id === workspaceId,
  )
  if (!targetWorkspaceMember) {
    return notFound()
  }

  const originUrl = await getOriginUrlFromHeader()
  const pathname = originUrl ? new URL(originUrl).pathname : ""
  enforceWorkspaceNotScheduledForDeletion(
    targetWorkspaceMember.workspace,
    pathname,
    hasWorkspacePermission(targetWorkspaceMember.permissions, "superAdmin"),
  )

  const allWorkspaces = allWorkspaceMembers.map((workspaceMember) => ({
    ...workspaceMember.workspace,
    logo: workspaceMember.workspace.logo
      ? new URL(workspaceMember.workspace.logo, storageUrl).toString()
      : null,
  }))

  const trialEndsAt = resolveTrialEndsAt(quota)
  const blocked = isBlockedFromPlan(quota?.planStatus ?? null, trialEndsAt)

  const quotaSummary: QuotaSummary = {
    planName: quota?.planName ?? null,
    planStatus: quota?.planStatus ?? null,
    trialEndsAt,
    metrics: buildQuotaMetrics(usage),
  }

  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get("sidebar_state")?.value === "true"

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar
        allWorkspaces={allWorkspaces}
        isPlatformAdmin={platformAdmin}
        isSuperAdmin={isSuperAdmin(user)}
        permissions={targetWorkspaceMember.permissions}
        quota={quotaSummary}
        workspaceId={workspaceId}
      />
      <SidebarInset>
        <main className="flex min-w-0 flex-1 flex-col gap-4 p-6">
          <ScheduledDeletionBanner
            scheduled={Boolean(
              targetWorkspaceMember.workspace.scheduledDeletionAt,
            )}
          />
          <ExpiredBanner blocked={cloud && blocked} />
          {children}
        </main>
        <SidebarTrigger className="absolute top-3 -left-2 z-10 border" />
      </SidebarInset>
    </SidebarProvider>
  )
}
