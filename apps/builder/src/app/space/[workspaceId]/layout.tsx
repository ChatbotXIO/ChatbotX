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
  SidebarMobileHandle,
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
    // `has-data-full-bleed:h-svh` caps the shell at the viewport for pages
    // that own the whole screen (the inbox — see `components/full-bleed.tsx`).
    // The wrapper's own `min-h-svh` is only a floor, so without this a
    // full-bleed page's `flex-1` has no definite height to resolve against and
    // grows with its content instead: the inbox composer ends up below the fold
    // on a short viewport. Scoping it to `:has()` keeps every ordinary page
    // scrolling the body exactly as before.
    <SidebarProvider
      className="has-data-full-bleed:h-svh"
      defaultOpen={defaultOpen}
    >
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
          `min-h-0` lets this column shrink to the capped shell above instead of
          being floored at its content height — without it the cap is inert and
          a full-bleed page still overflows.
        */}
        <main className="flex min-h-0 min-w-0 flex-1 flex-col gap-4 p-4 md:p-6">
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
        {/*
          Below `md` the sidebar collapses into a Sheet and `SidebarTrigger`
          above is hidden, so this handle is the only way in on a phone. It
          floats on the screen edge rather than sitting in a top bar: the
          viewport belongs to the page content.
        */}
        <SidebarMobileHandle />
      </SidebarInset>
    </SidebarProvider>
  )
}
