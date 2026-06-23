import {
  quotaEnforcementService,
  userQuotaService,
} from "@chatbotx.io/business"
import { notFound, redirect } from "next/navigation"
import { isCloud } from "@/env"
import { AccountRail } from "@/features/workspaces/components/account-rail"
import WorkspacesList from "@/features/workspaces/components/workspaces-list"
import { getCurrentUserAndAllLinkedWorkspaces } from "@/lib/auth/utils"
import { buildQuotaMetrics, resolveTrialEndsAt } from "@/lib/quota-metrics"

export default async function MainPage() {
  const userAndWorkspaces = await getCurrentUserAndAllLinkedWorkspaces()
  if (!userAndWorkspaces) {
    return notFound()
  }

  const { user, allWorkspaces, allWorkspaceMembers } = userAndWorkspaces

  // Plan + usage limits only apply to the hosted cloud edition. Self-hosted
  // community/enterprise installs use every feature freely — no quota gating.
  const cloud = isCloud()
  const [usageSummary, atLimit, quota] = await Promise.all([
    cloud ? quotaEnforcementService.getUsageSummary(user.id) : null,
    cloud ? quotaEnforcementService.getAtLimitMap(user.id) : null,
    cloud ? userQuotaService.getForUser(user.id) : null,
  ])

  const ownerWorkspaceIds = allWorkspaceMembers
    .filter((member) => member.role === "owner")
    .map((member) => member.workspace.id)

  // Self-managed trial gate (cloud only): a consumed trial can't reach
  // workspaces. Derived from the quota already fetched above — no extra query.
  if (cloud && userQuotaService.getAccessStateFromQuota(quota).blocked) {
    redirect("/trial-expired")
  }

  const trialEndsAt = resolveTrialEndsAt(quota)

  const userInfo = { name: user.name, email: user.email, image: user.image }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-8 px-6 py-12 md:flex-row md:py-16">
      <AccountRail
        metrics={buildQuotaMetrics(usageSummary)}
        planName={quota?.planName ?? null}
        planStatus={quota?.planStatus ?? null}
        trialEndsAt={trialEndsAt}
        user={userInfo}
      />

      <WorkspacesList
        isAtLimit={atLimit?.workspaces ?? false}
        ownerWorkspaceIds={ownerWorkspaceIds}
        user={userInfo}
        workspaces={allWorkspaces}
        workspacesLimit={usageSummary?.workspaces.limit ?? null}
      />
    </div>
  )
}
