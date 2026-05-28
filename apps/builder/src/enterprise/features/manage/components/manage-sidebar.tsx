"use client"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@chatbotx.io/ui/components/ui/sidebar"
import {
  Grid2x2PlusIcon,
  MailIcon,
  PaletteIcon,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { BrandIcon } from "@/components/brand-icon"
import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { authClient } from "@/lib/auth/auth-client"
import { portalNavItems } from "@/enterprise/features/manage/portal-nav"

type Props = {
  showEnterpriseItems: boolean
}

export function ManageSidebar({ showEnterpriseItems }: Props) {
  const t = useTranslations()
  const pathname = usePathname()
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
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <NavMain items={platformItems} />
        </SidebarGroup>

        {showEnterpriseItems && (
          <SidebarGroup>
            <SidebarGroupLabel>SaaS</SidebarGroupLabel>
            <SidebarMenu>
              {portalNavItems.map(({ title, url, icon: Icon }) => {
                const isActive = pathname.startsWith(url)
                return (
                  <SidebarMenuItem key={title}>
                    <SidebarMenuButton
                      className="h-9 cursor-pointer p-0"
                      isActive={isActive}
                      tooltip={title}
                    >
                      {/* Cross-zone: use <a> to force full navigation to portal */}
                      <a
                        className={`flex w-full items-center gap-2 p-2 ${isActive ? "dark:text-gray-50" : "dark:text-gray-400"}`}
                        href={url}
                      >
                        <Icon className="size-5 shrink-0" />
                        <span>{title}</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
    </Sidebar>
  )
}
