import {
  isPlatformAdmin,
  isSuperAdmin,
  quotaEnforcementService,
  userQuotaService,
} from "@chatbotx.io/business"
import { notFound } from "next/navigation"
import { ExpiredBanner } from "@/components/expired-banner"
import { WorkspaceDeletionPendingToast } from "@/components/workspace-deletion-pending-toast"
import { isCloud } from "@/env"
import { AccountRail } from "@/features/workspaces/components/account-rail"
import WorkspacesList from "@/features/workspaces/components/workspaces-list"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"
import { enforcePasswordCurrent } from "@/lib/auth/require-password-current"
import { getCurrentUserAndAllLinkedWorkspaces } from "@/lib/auth/utils"
import {
  buildQuotaMetrics,
  resolveBlockReason,
  resolveTrialEndsAt,
} from "@/lib/quota-metrics"

export default async function MainPage() {
  const userAndWorkspaces = await getCurrentUserAndAllLinkedWorkspaces()
  if (!userAndWorkspaces) {
    return notFound()
  }

  const { user, allWorkspaces, allWorkspaceMembers } = userAndWorkspaces

  // Reseller-provisioned accounts must set their own password before anything
  // else. Enforced in every protected layout/page, not just here.
  enforcePasswordCurrent(user)

  // Plan + usage limits only apply to the hosted cloud edition. Self-hosted
  // community/enterprise installs use every feature freely — no quota gating.
  const cloud = isCloud()
  const [usageSummary, atLimit, quota, platformAdmin] = await Promise.all([
    cloud ? quotaEnforcementService.getUsageSummary(user.id) : null,
    cloud ? quotaEnforcementService.getAtLimitMap(user.id) : null,
    cloud ? userQuotaService.getForUser(user.id) : null,
    isPlatformAdmin(user),
  ])

  const ownerWorkspaceIds = allWorkspaceMembers
    .filter((member) => member.role === "owner")
    .map((member) => member.workspace.id)
  const superAdminWorkspaceIds = allWorkspaceMembers
    .filter((member) =>
      hasWorkspacePermission(member.permissions, "superAdmin"),
    )
    .map((member) => member.workspace.id)

  const trialEndsAt = resolveTrialEndsAt(quota)
  const blockReason = resolveBlockReason(
    quota?.planStatus ?? null,
    trialEndsAt,
    atLimit?.mac ?? false,
  )
  const blocked = blockReason !== null

  const userInfo = { name: user.name, email: user.email, image: user.image }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col gap-8 px-6 py-12 md:py-16">
      <WorkspaceDeletionPendingToast />
      <ExpiredBanner blocked={cloud && blocked} reason={blockReason} />
      <div className="flex flex-col gap-8 md:flex-row">
        <AccountRail
          isPlatformAdmin={platformAdmin}
          isSuperAdmin={isSuperAdmin(user)}
          metrics={buildQuotaMetrics(usageSummary)}
          planName={quota?.planName ?? null}
          planStatus={quota?.planStatus ?? null}
          trialEndsAt={trialEndsAt}
          user={userInfo}
        />

        <WorkspacesList
          blocked={cloud && blocked}
          isAtLimit={atLimit?.workspaces ?? false}
          ownerWorkspaceIds={ownerWorkspaceIds}
          superAdminWorkspaceIds={superAdminWorkspaceIds}
          user={userInfo}
          workspaces={allWorkspaces}
          workspacesLimit={usageSummary?.workspaces.limit ?? null}
        />
      </div>
    </div>
  )
}
