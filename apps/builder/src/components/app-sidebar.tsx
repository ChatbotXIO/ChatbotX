"use client"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@chatbotx.io/ui/components/ui/sidebar"
import {
  AtomIcon,
  BrainIcon,
  ChartPieIcon,
  ChevronsRight,
  LightbulbIcon,
  MessageCircleMoreIcon,
  RadioIcon,
  SlidersHorizontalIcon,
  UsersIcon,
  WebhookIcon,
  WorkflowIcon,
  WrenchIcon,
} from "lucide-react"

import Link from "next/link"
import { useTranslations } from "next-intl"
import type { ComponentProps } from "react"
import { BrandIcon } from "@/components/brand-icon"
import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import { WorkspaceSwitcher } from "@/components/workspace-switcher"
import type { WorkspaceResource } from "@/features/workspaces/schema/resource"
import { authClient } from "@/lib/auth/auth-client"

export function AppSidebar({
  workspaceId,
  allWorkspaces,
  isPlatformAdmin,
  ...props
}: ComponentProps<typeof Sidebar> & {
  workspaceId: string
  allWorkspaces: WorkspaceResource[]
  isPlatformAdmin?: boolean
}) {
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
        title: t("fields.analytics.label"),
        url: `/space/${workspaceId}/dashboard`,
        icon: ChartPieIcon,
      },
      {
        title: t("fields.inbox.label"),
        url: `/space/${workspaceId}/inbox`,
        icon: MessageCircleMoreIcon,
      },
      {
        title: t("fields.flows.label"),
        url: `/space/${workspaceId}/flows`,
        icon: WorkflowIcon,
      },
      {
        title: t("fields.contacts.label"),
        url: `/space/${workspaceId}/contacts`,
        icon: UsersIcon,
      },
      {
        title: t("aiAgent.title"),
        url: `/space/${workspaceId}/ai-agents`,
        icon: BrainIcon,
      },
      {
        title: t("keywords.title"),
        url: `/space/${workspaceId}/automated-responses`,
        icon: AtomIcon,
      },
      {
        title: t("broadcasts.title"),
        url: `/space/${workspaceId}/broadcasts`,
        icon: RadioIcon,
      },
      {
        title: t("sequences.title"),
        url: `/space/${workspaceId}/sequences`,
        icon: ChevronsRight,
      },
      {
        title: t("triggers.title"),
        url: `/space/${workspaceId}/triggers`,
        icon: LightbulbIcon,
      },
      {
        title: t("webhooks.title"),
        url: `/space/${workspaceId}/webhooks`,
        icon: WebhookIcon,
      },
      {
        title: t("tools.title"),
        url: `/space/${workspaceId}/tools`,
        icon: WrenchIcon,
      },
      {
        title: t("settings.title"),
        url: `/space/${workspaceId}/settings/general`,
        icon: SlidersHorizontalIcon,
      },
    ],
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="gap-0 px-0 py-0">
        <Link
          className="flex h-12 items-center justify-center border-b"
          href="/"
        >
          <BrandIcon alt="Brand" />
        </Link>
        <div className="border-b px-1">
          <WorkspaceSwitcher workspaces={allWorkspaces} />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser isPlatformAdmin={isPlatformAdmin} user={data.user} />
      </SidebarFooter>
    </Sidebar>
  )
}
