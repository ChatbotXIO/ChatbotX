import { customDomainService, tenantService } from "@chatbotx.io/business"
import type { PortalPricingState } from "@chatbotx.io/ui/components/portal/pricing-nav-item"
import { buildResellerPricingUrl } from "@chatbotx.io/ui/lib/portal-pricing-url"
import { notFound } from "next/navigation"
import { ManageSidebar } from "@/enterprise/features/manage/components/manage-sidebar"
import { PortalManageSidebar } from "@/enterprise/features/manage/components/portal-manage-sidebar"
import { env, isCloud } from "@/env"
import { ManageLayout } from "@/features/manage/manage-layout"
import { enforcePasswordCurrent } from "@/lib/auth/require-password-current"
import { getCurrentUser } from "@/lib/auth/utils"

async function resolvePricingState(
  tenantId: string,
): Promise<PortalPricingState> {
  const domains = await customDomainService.findByTenantId(tenantId)
  const active = domains.find((domain) => domain.status === "active")
  return active
    ? { state: "active", url: buildResellerPricingUrl(active.domain) }
    : { state: "missing" }
}

export default async function ManageLayoutPage({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await getCurrentUser()
  if (!user) {
    return notFound()
  }

  enforcePasswordCurrent(user)

  /**
   * Cloud edition: only the active tenant owner (reseller) may access manage,
   * and they get the reseller `PortalManageSidebar`.
   * Community / enterprise (self-hosted): only the platform admin may access,
   * and they get the platform-only `ManageSidebar`.
   */
  if (isCloud()) {
    const tenant = await tenantService.findByOwner(user.id)
    if (tenant?.status !== "active") {
      return notFound()
    }

    const pricing = await resolvePricingState(tenant.id)
    return (
      <ManageLayout sidebar={<PortalManageSidebar pricing={pricing} />}>
        {children}
      </ManageLayout>
    )
  }

  if (!env.PLATFORM_ADMIN_EMAIL || user.email !== env.PLATFORM_ADMIN_EMAIL) {
    return notFound()
  }

  return <ManageLayout sidebar={<ManageSidebar />}>{children}</ManageLayout>
}
