import { customDomainService } from "@chatbotx.io/business"
import type { PortalPricingState } from "@chatbotx.io/ui/components/portal/pricing-nav-item"
import type { PortalSaasFlags } from "@chatbotx.io/ui/config/portal-nav"
import { buildResellerPricingUrl } from "@chatbotx.io/ui/lib/portal-pricing-url"
import { notFound } from "next/navigation"
import { PortalManageSidebar } from "@/enterprise/features/manage/components/portal-manage-sidebar"
import { isCloud } from "@/env"
import { ManageLayout } from "@/features/manage/manage-layout"
import { enforcePasswordCurrent } from "@/lib/auth/require-password-current"
import { getManageAccess } from "./reseller-guard"

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
  const { user, tenant, quota, canManageCredentials, canManageReseller } =
    await getManageAccess()
  if (!user) {
    return notFound()
  }

  enforcePasswordCurrent(user)

  /**
   * Cloud edition: only the active tenant owner (reseller) may access manage,
   * and they get the reseller `PortalManageSidebar`.
   */
  if (!isCloud()) {
    return notFound()
  }

  if (!canManageCredentials) {
    return notFound()
  }

  const flags: PortalSaasFlags = {
    saasMode: quota?.saasMode ?? false,
    whiteLabel: quota?.whiteLabel ?? false,
  }
  // Pricing lives on the reseller's custom domain — only white-label resellers
  // have one, so resolve it only then (mirrors the enterprise portal sidebar).
  const pricing =
    tenant && canManageReseller && flags.whiteLabel
      ? await resolvePricingState(tenant.id)
      : undefined

  return (
    <ManageLayout
      sidebar={
        <PortalManageSidebar
          canManageReseller={canManageReseller}
          flags={flags}
          pricing={pricing}
        />
      }
    >
      {children}
    </ManageLayout>
  )
}
