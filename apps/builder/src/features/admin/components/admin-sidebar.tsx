"use client"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@chatbotx.io/ui/components/ui/sidebar"
import {
  CircleHelpIcon,
  Grid2x2PlusIcon,
  MailIcon,
  PaletteIcon,
} from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { BrandIcon } from "@/components/brand-icon"
import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { isCloud } from "@/env"
import { authClient } from "@/lib/auth/auth-client"

/**
 * Super-admin sidebar for the `/admin` console.
 * Gated by `isSuperAdmin` in the parent layout; no auth check needed here.
 */
export function AdminSidebar({
  showEnterpriseItems,
}: {
  showEnterpriseItems: boolean
}) {
  const t = useTranslations()
  const tManage = useTranslations("manageSidebar")
  const { data: session } = authClient.useSession()

  const user = {
    name: session?.user.name ?? "",
    email: session?.user.email ?? "",
    avatar: session?.user.image ?? "",
  }

  const platformItems = [
    {
      title: t("platformAdmin.platformCredentials.title"),
      url: "/admin/platform-credentials",
      icon: Grid2x2PlusIcon,
    },
    ...(showEnterpriseItems && !isCloud()
      ? [
          {
            title: t("platformBranding.title"),
            url: "/admin/branding",
            icon: PaletteIcon,
          },
          {
            title: t("platformEmailTemplates.title"),
            url: "/admin/email-templates",
            icon: MailIcon,
          },
        ]
      : []),
    ...(showEnterpriseItems
      ? [
          {
            title: t("platformAdmin.helpItems.title"),
            url: "/admin/help-items",
            icon: CircleHelpIcon,
          },
        ]
      : []),
  ]

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-0 px-0 py-0">
        <Link
          className="flex h-12 items-center justify-center border-b"
          href="/"
        >
          <BrandIcon alt="Brand" />
        </Link>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={platformItems} label={tManage("platformGroup")} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}
