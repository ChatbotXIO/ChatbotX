"use client"

import {
  NavMain,
  type PortalNavItem,
} from "@chatbotx.io/ui/components/portal/nav-main"
import {
  PortalPricingNavItem,
  type PortalPricingState,
} from "@chatbotx.io/ui/components/portal/pricing-nav-item"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@chatbotx.io/ui/components/ui/sidebar"
import type { ReactNode } from "react"

type Props = {
  /** Brand logo/icon, rendered inside the header home link. App-specific. */
  header: ReactNode
  /** User menu (e.g. `NavUser`), rendered in the footer. App-specific. */
  footer: ReactNode
  /** Target of the brand header home link. */
  homeHref?: string

  platformItems: PortalNavItem[]
  platformLabel: string
  /** Full-navigation links for the platform group (different Next.js zone). */
  crossZonePlatform?: boolean

  saasItems: PortalNavItem[]
  saasLabel: string
  /** Full-navigation links for the SaaS group (different Next.js zone). */
  crossZoneSaas?: boolean

  /** When provided, renders the smart pricing-page item below the groups. */
  pricing?: PortalPricingState
  pricingTitle?: string
  /** Where the missing-domain CTA links to. Required to render the pricing item. */
  customDomainHref?: string
}

/**
 * Presentational reseller-portal sidebar shared by the enterprise portal
 * (`apps/portal`) and the OSS cloud-edition manage area. It owns layout and the
 * nav groups; data, the brand header, and the user footer are injected so each
 * app keeps its own data-fetching, branding, and (heavily app-coupled) user
 * menu.
 */
export function PortalSideNav({
  header,
  footer,
  homeHref = "/",
  platformItems,
  platformLabel,
  crossZonePlatform = false,
  saasItems,
  saasLabel,
  crossZoneSaas = false,
  pricing,
  pricingTitle,
  customDomainHref,
}: Props) {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-0 px-0 py-0">
        <a
          className="flex h-12 items-center justify-center border-b"
          href={homeHref}
        >
          {header}
        </a>
      </SidebarHeader>

      <SidebarContent>
        <NavMain
          crossZone={crossZonePlatform}
          items={platformItems}
          label={platformLabel}
        />
        {saasItems.length > 0 && (
          <NavMain
            crossZone={crossZoneSaas}
            items={saasItems}
            label={saasLabel}
          />
        )}
        {pricing && customDomainHref && (
          <PortalPricingNavItem
            customDomainHref={customDomainHref}
            pricing={pricing}
            title={pricingTitle}
          />
        )}
      </SidebarContent>

      <SidebarFooter>{footer}</SidebarFooter>
    </Sidebar>
  )
}
