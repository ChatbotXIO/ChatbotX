import type { LucideIcon } from "lucide-react"
import {
  BarChart2,
  Globe,
  Layers,
  LayoutList,
  Settings,
  Tag,
  UserPlus,
} from "lucide-react"

export type PortalNavKey =
  | "portalUsers"
  | "portalWorkspaces"
  | "portalPlans"
  | "portalUsage"
  | "portalCustomDomain"
  | "portalPaymentProcessor"
  | "portalPricingPage"

export type PortalNavConfig = {
  key: PortalNavKey
  url: string
  icon: LucideIcon
  external?: boolean
}

export const portalNavConfigs: PortalNavConfig[] = [
  { key: "portalUsers", url: "/portal/sub-accounts", icon: UserPlus },
  { key: "portalWorkspaces", url: "/portal/workspaces", icon: Layers },
  { key: "portalPlans", url: "/portal/plans", icon: LayoutList },
  { key: "portalUsage", url: "/portal/usage", icon: BarChart2 },
  { key: "portalCustomDomain", url: "/portal/custom-domain", icon: Globe },
  {
    key: "portalPaymentProcessor",
    url: "/portal/settings/payment-processor",
    icon: Settings,
  },
  {
    key: "portalPricingPage",
    url: "/portal/pricing",
    icon: Tag,
    external: true,
  },
]
