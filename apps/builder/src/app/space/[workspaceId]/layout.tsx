import {
  isPlatformAdmin,
  isSuperAdmin,
  isWorkspaceScheduledForDeletion,
  quotaEnforcementService,
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
import { RefreshOnNavigation } from "@/components/refresh-on-navigation"
import { ScheduledDeletionBanner } from "@/components/scheduled-deletion-banner"
import { WorkspaceDeletionTabSync } from "@/components/workspace-deletion-tab-sync"
import { isCloud } from "@/env"
import { CouponTopicStoreProvider } from "@/features/coupons/provider/coupon-topic-store-context"
import { getTenantSettings } from "@/features/tenant/utils"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"
import { enforcePasswordCurrent } from "@/lib/auth/require-password-current"
import { getCurrentUser } from "@/lib/auth/utils"
import { buildWorkspaceQuotaMetrics } from "@/lib/quota-metrics"
import { enforceWorkspaceNotScheduledForDeletionFromRequest } from "@/lib/workspace/require-not-scheduled-for-deletion"
import { resolveWorkspaceBlockState } from "@/lib/workspace-quota"

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
  const [allWorkspaceMembers, { storageUrl }, platformAdmin] =
    await Promise.all([
      workspaceMemberService.listByUserId({ userId: user.id }),
      getTenantSettings(),
      isPlatformAdmin(user),
    ])
  const targetWorkspaceMember = allWorkspaceMembers.find(
    (workspaceMember) => workspaceMember.workspace.id === workspaceId,
  )
  if (!targetWorkspaceMember) {
    return notFound()
  }

  const [{ blocked, blockReason, quota, trialEndsAt }, usage] =
    await Promise.all([
      resolveWorkspaceBlockState(targetWorkspaceMember.workspace.ownerId),
      cloud
        ? quotaEnforcementService.getWorkspaceUsageSummary({
            userId: targetWorkspaceMember.workspace.ownerId,
            workspaceId,
          })
        : null,
    ])

  await enforceWorkspaceNotScheduledForDeletionFromRequest(
    targetWorkspaceMember.workspace,
    hasWorkspacePermission(targetWorkspaceMember.permissions, "superAdmin"),
  )

  const allWorkspaces = allWorkspaceMembers.map((workspaceMember) => ({
    ...workspaceMember.workspace,
    logo: workspaceMember.workspace.logo
      ? new URL(workspaceMember.workspace.logo, storageUrl).toString()
      : null,
  }))

  const quotaSummary: QuotaSummary = {
    planName: quota?.planName ?? null,
    planStatus: quota?.planStatus ?? null,
    trialEndsAt,
    metrics: buildWorkspaceQuotaMetrics(usage),
  }

  const cookieStore = await cookies()
  const defaultOpen = cookieStore.get("sidebar_state")?.value === "true"

  const scheduledForDeletion = isWorkspaceScheduledForDeletion(
    targetWorkspaceMember.workspace,
  )

  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar
        allWorkspaces={allWorkspaces}
        isPlatformAdmin={platformAdmin}
        isSuperAdmin={isSuperAdmin(user)}
        permissions={targetWorkspaceMember.permissions}
        quota={quotaSummary}
        scheduledForDeletion={scheduledForDeletion}
        workspaceId={workspaceId}
      />
      <SidebarInset>
        <main className="flex min-w-0 flex-1 flex-col gap-4 p-6">
          <WorkspaceDeletionTabSync
            scheduledForDeletion={scheduledForDeletion}
            workspaceId={workspaceId}
          />
          <ScheduledDeletionBanner scheduled={scheduledForDeletion} />
          {!scheduledForDeletion && (
            <RefreshOnNavigation workspaceId={workspaceId} />
          )}
          <ExpiredBanner blocked={cloud && blocked} reason={blockReason} />
          <CouponTopicStoreProvider
            autoInitialize={false}
            workspaceId={workspaceId}
          >
            {children}
          </CouponTopicStoreProvider>
        </main>
        <SidebarTrigger className="absolute top-3 -left-2 z-10 border" />
      </SidebarInset>
    </SidebarProvider>
  )
}
