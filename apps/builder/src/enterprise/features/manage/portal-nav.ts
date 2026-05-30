import type { LucideIcon } from "lucide-react"
import {
  BarChart2Icon,
  GlobeIcon,
  LayoutListIcon,
  SettingsIcon,
  UsersIcon,
} from "lucide-react"

export type PortalNavKey =
  | "portalUsers"
  | "portalPlans"
  | "portalUsage"
  | "portalCustomDomain"
  | "portalPaymentProcessor"

export type PortalNavConfig = {
  key: PortalNavKey
  url: string
  icon: LucideIcon
}

export const portalNavConfigs: PortalNavConfig[] = [
  { key: "portalUsers", url: "/portal/users", icon: UsersIcon },
  { key: "portalPlans", url: "/portal/plans", icon: LayoutListIcon },
  { key: "portalUsage", url: "/portal/usage", icon: BarChart2Icon },
  { key: "portalCustomDomain", url: "/portal/custom-domain", icon: GlobeIcon },
  {
    key: "portalPaymentProcessor",
    url: "/portal/settings/payment-processor",
    icon: SettingsIcon,
  },
]
