import {
  integrationService,
  isPlatformAdmin,
  isSuperAdmin,
  isWorkspaceScheduledForDeletion,
  quotaEnforcementService,
  workspaceMemberService,
} from "@chatbotx.io/business"
import {
  SidebarInset,
  SidebarMobileTrigger,
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
import { TokenRefreshErrorDialog } from "@/components/token-refresh-error-dialog"
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

  const [
    { blocked, blockReason, quota, trialEndsAt },
    usage,
    tokenRefreshErrors,
  ] = await Promise.all([
    resolveWorkspaceBlockState(targetWorkspaceMember.workspace.ownerId),
    cloud
      ? quotaEnforcementService.getWorkspaceUsageSummary({
          userId: targetWorkspaceMember.workspace.ownerId,
          workspaceId,
        })
      : null,
    integrationService.findTokenRefreshErrorsByWorkspaceId(workspaceId),
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
        {/*
          Below `md` the sidebar collapses into a Sheet, and `SidebarTrigger`
          below is positioned off the inset's inline edge — where nothing can
          reach it. This bar is the only way in on a phone, so it stays pinned
          while the page scrolls (the body is the scroll container: the sidebar
          wrapper is `min-h-svh` with no overflow of its own).
        */}
        <header className="sticky top-0 z-20 flex h-12 shrink-0 items-center gap-2 border-b bg-background px-2 pt-[env(safe-area-inset-top)] md:hidden">
          <SidebarMobileTrigger />
          <span className="truncate font-medium text-sm">
            {targetWorkspaceMember.workspace.name}
          </span>
        </header>
        <main className="flex min-w-0 flex-1 flex-col gap-4 p-4 md:p-6">
          <WorkspaceDeletionTabSync
            scheduledForDeletion={scheduledForDeletion}
            workspaceId={workspaceId}
          />
          <ScheduledDeletionBanner scheduled={scheduledForDeletion} />
          {!scheduledForDeletion && (
            <RefreshOnNavigation workspaceId={workspaceId} />
          )}
          <ExpiredBanner blocked={cloud && blocked} reason={blockReason} />
          <TokenRefreshErrorDialog
            errors={tokenRefreshErrors}
            workspaceId={workspaceId}
          />
          <CouponTopicStoreProvider
            autoInitialize={false}
            workspaceId={workspaceId}
          >
            {children}
          </CouponTopicStoreProvider>
        </main>
        <SidebarTrigger className="absolute -inset-s-2 top-3 z-10 hidden border md:inline-flex" />
      </SidebarInset>
    </SidebarProvider>
  )
}
