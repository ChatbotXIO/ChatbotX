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
  { key: "portalUsers", url: "/manage/users", icon: UsersIcon },
  { key: "portalPlans", url: "/manage/plans", icon: LayoutListIcon },
  { key: "portalUsage", url: "/manage/usage", icon: BarChart2Icon },
  { key: "portalCustomDomain", url: "/manage/custom-domain", icon: GlobeIcon },
  {
    key: "portalPaymentProcessor",
    url: "/manage/settings/payment-processor",
    icon: SettingsIcon,
  },
]
