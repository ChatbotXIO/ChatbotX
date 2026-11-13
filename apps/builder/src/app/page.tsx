import { resolveTenantByDomain } from "@chatbotx.io/auth/tenant"
import {
  hasOwnCredentialAccess,
  isSuperAdmin,
  quotaEnforcementService,
  tenantService,
  userQuotaService,
} from "@chatbotx.io/business"
import { ROOT_TENANT_ID } from "@chatbotx.io/database/schema"
import { notFound, redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { ExpiredBanner } from "@/components/expired-banner"
import { WorkspaceDeletionPendingToast } from "@/components/workspace-deletion-pending-toast"
import { isCloud } from "@/env"
import { AccountRail } from "@/features/workspaces/components/account-rail"
import { DeletedWorkspaces } from "@/features/workspaces/components/deleted-workspaces"
import { HomeTemplatesPanel } from "@/features/workspaces/components/home-templates-panel"
import WorkspacesList from "@/features/workspaces/components/workspaces-list"
import { resolveHomeTemplatesView } from "@/features/workspaces/lib/home-templates-view"
import { loadHomeTemplateStore } from "@/features/workspaces/lib/load-home-template-store"
import { homeSearchParamsCache } from "@/features/workspaces/schema/home-search-params"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"
import { enforcePasswordCurrent } from "@/lib/auth/require-password-current"
import { getCurrentUserAndAllLinkedWorkspaces } from "@/lib/auth/utils"
import { getDomainFromHeader } from "@/lib/domain"
import {
  buildQuotaMetrics,
  resolveBlockReason,
  resolveTrialEndsAt,
} from "@/lib/quota-metrics"
import { ensureFirstWorkspace } from "@/lib/workspace/create-first-workspace"

export default async function MainPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const userAndWorkspaces = await getCurrentUserAndAllLinkedWorkspaces()
  if (!userAndWorkspaces) {
    return notFound()
  }

  const { user, allWorkspaces, allWorkspaceMembers } = userAndWorkspaces

  // Reseller-provisioned accounts must set their own password before anything
  // else. Enforced in every protected layout/page, not just here.
  enforcePasswordCurrent(user)

  // A user with no membership at all (not invited anywhere) gets a default
  // workspace so MCP/CLI setup does not wait on connecting a channel. Invited
  // users keep the list. A plan-limit failure yields null: fall through to the
  // list rather than redirecting in a loop.
  if (allWorkspaceMembers.length === 0) {
    const t = await getTranslations("workspaces")
    const workspace = await ensureFirstWorkspace(user.id, {
      name: t("defaultName", { name: user.name || user.email }),
    })
    if (workspace) {
      redirect(`/space/${workspace.id}/dashboard`)
    }
  }

  // Plan + usage limits only apply to the hosted cloud edition. Self-hosted
  // community/enterprise installs use every feature freely — no quota gating.
  const cloud = isCloud()
  const domain = await getDomainFromHeader()
  const { tab, key } = await homeSearchParamsCache.parse(await searchParams)
  // An empty `?key=` (a cut-off link) means no template, like a missing one.
  const templateKey = key || null
  // One tenant lookup feeds both the platform-context check and the store read.
  const tenantIdPromise = resolveTenantByDomain(domain)
  const [
    usageSummary,
    atLimit,
    quota,
    ownedTenant,
    tenantId,
    superAdmin,
    templateStore,
  ] = await Promise.all([
    cloud ? quotaEnforcementService.getUsageSummary(user.id) : null,
    cloud ? quotaEnforcementService.getAtLimitMap(user.id) : null,
    cloud ? userQuotaService.getForUser(user.id) : null,
    cloud ? tenantService.findByOwner(user.id) : null,
    tenantIdPromise,
    isSuperAdmin(user),
    loadHomeTemplateStore({ tab, templateKey, tenantId: tenantIdPromise }),
  ])
  const templatesView = resolveHomeTemplatesView(
    { tab, templateKey },
    templateStore,
  )
  if (templatesView.redirectToHome) {
    redirect("/")
  }
  const canAccessManage = cloud && hasOwnCredentialAccess(ownedTenant, quota)
  // "Served with platform identity" — not the same claim as user.tenantId,
  // which the session never carries (see SessionUser in lib/auth/utils.ts).
  // Gates the Redeem link: /portal/redeem 404s on non-platform hosts.
  const isPlatformContext = tenantId === ROOT_TENANT_ID

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
    <div className="mx-auto w-full max-w-7xl px-6">
      <WorkspaceDeletionPendingToast />
      <ExpiredBanner blocked={cloud && blocked} reason={blockReason} />
      <div className="flex flex-col gap-8 py-8 md:flex-row md:items-start">
        <AccountRail
          canAccessManage={canAccessManage}
          isPlatformContext={isPlatformContext}
          isSuperAdmin={superAdmin}
          metrics={buildQuotaMetrics(usageSummary)}
          planName={quota?.planName ?? null}
          planStatus={quota?.planStatus ?? null}
          trialEndsAt={trialEndsAt}
          user={userInfo}
        />

        <div className="min-w-0 flex-1 space-y-8">
          <WorkspacesList
            activeTab={templatesView.activeTab}
            blocked={cloud && blocked}
            isAtLimit={atLimit?.workspaces ?? false}
            ownerWorkspaceIds={ownerWorkspaceIds}
            reason={blockReason}
            showTemplatesTab={templatesView.showTemplatesTab}
            superAdminWorkspaceIds={superAdminWorkspaceIds}
            templatesPanel={
              <HomeTemplatesPanel
                catalog={templateStore.catalog}
                openedTemplate={templateStore.openedTemplate}
                panel={templatesView.panel}
                userId={user.id}
              />
            }
            user={userInfo}
            workspaces={allWorkspaces}
          />
          {templatesView.activeTab === "workspaces" && (
            <DeletedWorkspaces ownerId={user.id} />
          )}
        </div>
      </div>
    </div>
  )
}
