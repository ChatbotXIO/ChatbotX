"use client"

import type { PortalNavItem } from "@chatbotx.io/ui/components/portal/nav-main"
import { PortalSideNav } from "@chatbotx.io/ui/components/portal/portal-side-nav"
import type { PortalPricingState } from "@chatbotx.io/ui/components/portal/pricing-nav-item"
import {
  type PortalSaasFlags,
  portalSaasNavConfigs,
} from "@chatbotx.io/ui/config/portal-nav"
import { Grid2x2PlusIcon, MailIcon, PaletteIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { BrandIcon } from "@/components/brand-icon"
import { NavUser } from "@/components/nav-user"
import { authClient } from "@/lib/auth/auth-client"

/** basePath of the reseller portal app the SaaS items cross-zone into. */
const PORTAL_PREFIX = "/portal"

type Props = {
  /** The reseller's capability flags — SaaS items are filtered by them. */
  flags: PortalSaasFlags
  /**
   * Resolved server-side from the reseller's verified custom domain. Omitted
   * (no pricing item) when the reseller lacks the `whiteLabel` entitlement.
   */
  pricing?: PortalPricingState
}

/**
 * Cloud-edition reseller sidebar rendered in the OSS builder `/manage` zone.
 * Shares the presentational `PortalSideNav` with the enterprise `apps/portal`
 * so both editions render the same navbar — same item set (flag-filtered),
 * same labels, same smart pricing. Platform items stay in-zone (builder's own
 * `/manage/*` pages); SaaS items cross-zone into `/portal/*`.
 */
export function PortalManageSidebar({ flags, pricing }: Props) {
  const t = useTranslations()
  const tManage = useTranslations("manageSidebar")
  const { data: session } = authClient.useSession()

  const user = {
    name: session?.user.name ?? "",
    email: session?.user.email ?? "",
    avatar: session?.user.image ?? "",
  }

  const platformItems: PortalNavItem[] = [
    {
      title: t("platformCredentials.title"),
      url: "/manage/platform-credentials",
      icon: Grid2x2PlusIcon,
    },
    {
      title: t("platformBranding.title"),
      url: "/manage/branding",
      icon: PaletteIcon,
    },
    {
      title: t("platformEmailTemplates.title"),
      url: "/manage/email-templates",
      icon: MailIcon,
    },
  ]

  const saasItems: PortalNavItem[] = portalSaasNavConfigs
    .filter((item) => flags[item.requires])
    .map((item) => ({
      title: tManage(item.key),
      url: `${PORTAL_PREFIX}${item.pathSuffix}`,
      icon: item.icon,
    }))

  return (
    <PortalSideNav
      crossZoneSaas
      customDomainHref={`${PORTAL_PREFIX}/custom-domain`}
      footer={<NavUser user={user} />}
      header={<BrandIcon alt="Brand" />}
      platformItems={platformItems}
      platformLabel={tManage("platformGroup")}
      pricing={pricing}
      pricingTitle={tManage("portalPricingPage")}
      saasItems={saasItems}
      saasLabel={tManage("saasGroup")}
    />
  )
}
