"use client"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@chatbotx.io/ui/components/ui/sidebar"
import {
  Building2Icon,
  CircleHelpIcon,
  Grid2x2PlusIcon,
  ListTodoIcon,
  MailIcon,
  PaletteIcon,
  RadioTowerIcon,
  ScrollTextIcon,
  SendIcon,
  ShieldCheckIcon,
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

  const communityItems = [
    {
      title: t("platformAdmin.platformCredentials.title"),
      url: "/admin/platform-credentials",
      icon: Grid2x2PlusIcon,
    },
  ]

  const enterpriseItems = [
    {
      title: t("platformAdmin.workspaces.title"),
      url: "/admin/workspaces",
      icon: Building2Icon,
    },
    {
      title: t("platformAdmin.workspaces.deletedTitle"),
      url: "/admin/workspaces/deleted",
      icon: Building2Icon,
    },
    {
      title: t("channels.title"),
      url: "/admin/platform-channels",
      icon: RadioTowerIcon,
    },
    {
      title: t("platformAdmin.admins.title"),
      url: "/admin/admins",
      icon: ShieldCheckIcon,
    },
    {
      title: t("platformAdmin.auditLogs.title"),
      url: "/admin/audit-logs",
      icon: ScrollTextIcon,
    },
    ...(isCloud()
      ? []
      : [
          {
            title: t("platformAdmin.smtp.title"),
            url: "/admin/smtp",
            icon: SendIcon,
          },
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
        ]),
    {
      title: t("platformAdmin.helpItems.title"),
      url: "/admin/help-items",
      icon: CircleHelpIcon,
    },
  ]

  const toolsItems = [
    {
      title: t("platformAdmin.queues.title"),
      url: "/developer/queues",
      icon: ListTodoIcon,
      crossZone: true,
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
        <NavMain items={communityItems} label={tManage("communityGroup")} />
        {showEnterpriseItems && (
          <NavMain items={enterpriseItems} label={tManage("enterpriseGroup")} />
        )}
        <NavMain items={toolsItems} label={tManage("toolsGroup")} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}
