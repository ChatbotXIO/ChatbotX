import {
  isPlatformAdmin,
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
import { notFound, redirect } from "next/navigation"
import { AppSidebar } from "@/components/app-sidebar"
import type { QuotaSummary } from "@/components/nav-usage"
import { isCloud } from "@/env"
import { getTenantSettings } from "@/features/tenant/utils"
import { getCurrentUser } from "@/lib/auth/utils"
import { buildQuotaMetrics, resolveTrialEndsAt } from "@/lib/quota-metrics"

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
  const [allWorkspaceMembers, { storageUrl }, platformAdmin, quota, usage] =
    await Promise.all([
      workspaceMemberService.listByUserId({ userId: user.id }),
      getTenantSettings(),
      isPlatformAdmin(user),
      cloud ? userQuotaService.getForUser(user.id) : Promise.resolve(null),
      cloud ? quotaEnforcementService.getUsageSummary(user.id) : null,
    ])
  if (
    !allWorkspaceMembers.some(
      (workspaceMember) => workspaceMember.workspace.id === workspaceId,
    )
  ) {
    return notFound()
  }

  // Self-managed trial gate: block the workspace shell once the trial is
  // consumed. /trial-expired sits outside this layout so it stays reachable.
  // Derived from the quota already fetched above — no extra query.
  if (cloud && userQuotaService.getAccessStateFromQuota(quota).blocked) {
    redirect("/trial-expired")
  }

  const allWorkspaces = allWorkspaceMembers.map((workspaceMember) => ({
    ...workspaceMember.workspace,
    logo: workspaceMember.workspace.logo
      ? new URL(workspaceMember.workspace.logo, storageUrl).toString()
      : null,
  }))

  const trialEndsAt = resolveTrialEndsAt(quota)

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
