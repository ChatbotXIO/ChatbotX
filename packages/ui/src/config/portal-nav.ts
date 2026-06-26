import type { LucideIcon } from "lucide-react"
import {
  BarChart2,
  Globe,
  Layers,
  LayoutList,
  Mail,
  Settings,
  UserPlus,
} from "lucide-react"

/**
 * Reseller capability flags. Enterprise (`apps/portal`) filters nav items by
 * the user's flags; cloud-edition OSS shows the full set (no per-flag gating).
 */
export type PortalSaasFlag = "saasMode" | "whiteLabel"

/** The reseller's resolved capability flags, keyed by {@link PortalSaasFlag}. */
export type PortalSaasFlags = Record<PortalSaasFlag, boolean>

/** i18n keys (see `manageSidebar` in the OSS builder messages). */
export type PortalSaasNavKey =
  | "portalUsers"
  | "portalWorkspaces"
  | "portalPlans"
  | "portalUsage"
  | "portalCustomDomain"
  | "portalPaymentProcessor"
  | "portalSmtp"

export type PortalSaasNavConfig = {
  key: PortalSaasNavKey
  /**
   * Path relative to the portal app root, WITHOUT the `/portal` basePath
   * prefix. Enterprise uses it as-is (basePath adds `/portal`); the OSS
   * cloud manage sidebar prepends `/portal` for its cross-zone links.
   */
  pathSuffix: string
  icon: LucideIcon
  /** Reseller capability this item requires (enterprise gates on it). */
  requires: PortalSaasFlag
}

/**
 * The canonical reseller-portal SaaS nav: a single source of truth for the
 * item set, order, and icons shared by both the enterprise portal sidebar and
 * the OSS cloud manage sidebar. The pricing-page entry is rendered separately
 * (it is a smart, domain-aware item), so it is intentionally not listed here.
 */
export const portalSaasNavConfigs: PortalSaasNavConfig[] = [
  {
    key: "portalUsers",
    pathSuffix: "/sub-accounts",
    icon: UserPlus,
    requires: "whiteLabel",
  },
  {
    key: "portalWorkspaces",
    pathSuffix: "/workspaces",
    icon: Layers,
    requires: "whiteLabel",
  },
  {
    key: "portalPlans",
    pathSuffix: "/plans",
    icon: LayoutList,
    requires: "whiteLabel",
  },
  {
    key: "portalUsage",
    pathSuffix: "/usage",
    icon: BarChart2,
    requires: "whiteLabel",
  },
  {
    key: "portalCustomDomain",
    pathSuffix: "/custom-domain",
    icon: Globe,
    requires: "whiteLabel",
  },
  {
    key: "portalPaymentProcessor",
    pathSuffix: "/settings/payment-processor",
    icon: Settings,
    requires: "saasMode",
  },
  {
    key: "portalSmtp",
    pathSuffix: "/settings/smtp",
    icon: Mail,
    requires: "whiteLabel",
  },
]
