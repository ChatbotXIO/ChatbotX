"use client"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@chatbotx.io/ui/components/ui/sidebar"
import { Grid2x2PlusIcon, MailIcon, PaletteIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { BrandIcon } from "@/components/brand-icon"
import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { authClient } from "@/lib/auth/auth-client"

/**
 * Platform-only manage sidebar for the community and enterprise (self-hosted)
 * editions. The cloud edition renders the richer reseller `PortalManageSidebar`
 * instead — the edition switch lives in `app/manage/layout.tsx`.
 */
export function ManageSidebar() {
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
