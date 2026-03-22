"use client"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@aha.chat/ui/components/ui/sidebar"
import {
  CoinsIcon,
  CreditCardIcon,
  Grid2x2PlusIcon,
  Users2Icon,
} from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { BrandIcon } from "@/components/brand-icon"
import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { authClient } from "@/lib/auth/auth-client"

export function ManageSidebar() {
  const t = useTranslations()
  const { data: session } = authClient.useSession()

  const data = {
    user: {
      name: session?.user.name ?? "",
      email: session?.user.email ?? "",
      avatar: session?.user.image ?? "",
    },
    navMain: [
      {
        title: t("integrations.title"),
        url: "/manage/integrations",
        icon: Grid2x2PlusIcon,
        isActive: true,
      },
      {
        title: t("plans.title"),
        url: "/manage/plans",
        icon: CoinsIcon,
      },
      {
        title: t("subscriptions.title"),
        url: "/manage/subscriptions",
        icon: CreditCardIcon,
      },
      {
        title: t("users.title"),
        url: "/manage/users",
        icon: Users2Icon,
      },
    ],
  }

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
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  )
}
