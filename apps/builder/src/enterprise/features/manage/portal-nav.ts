import {
  BarChart2Icon,
  GlobeIcon,
  LayoutListIcon,
  SettingsIcon,
  UsersIcon,
} from "lucide-react"

export const portalNavItems = [
  { title: "Users", url: "/manage/users", icon: UsersIcon },
  { title: "Plans", url: "/manage/plans", icon: LayoutListIcon },
  { title: "Usage", url: "/manage/usage", icon: BarChart2Icon },
  { title: "Custom Domain", url: "/manage/custom-domain", icon: GlobeIcon },
  { title: "Payment Processor", url: "/manage/settings/payment-processor", icon: SettingsIcon },
]
