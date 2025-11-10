"use client"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@aha.chat/ui/components/ui/sidebar"
import {
  AtomIcon,
  BrainIcon,
  ChartPieIcon,
  MessageCircleMoreIcon,
  RadioIcon,
  SlidersHorizontalIcon,
  UsersIcon,
  WorkflowIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { type ComponentProps, use } from "react"
import { ChatbotSwitcher } from "@/components/chatbot-switcher"
import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import type { ChatbotResource } from "@/features/chatbots/schemas"
import { authClient } from "@/lib/auth/auth-client"

export function AppSidebar({
  chatbotId,
  allChatbotsPromise,
  ...props
}: ComponentProps<typeof Sidebar> & {
  chatbotId: string
  allChatbotsPromise: Promise<{ chatbots: ChatbotResource[] }>
}) {
  const t = useTranslations()
  const { chatbots } = use(allChatbotsPromise)
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
        url: `/chatbots/${chatbotId}/dashboard`,
        icon: ChartPieIcon,
        isActive: true,
      },
      {
        title: t("fields.inbox.label"),
        url: `/chatbots/${chatbotId}/inbox`,
        icon: MessageCircleMoreIcon,
      },
      {
        title: t("fields.flows.label"),
        url: `/chatbots/${chatbotId}/flows`,
        icon: WorkflowIcon,
      },
      {
        title: t("fields.contacts.label"),
        url: `/chatbots/${chatbotId}/contacts`,
        icon: UsersIcon,
      },
      {
        title: t("fields.aiAgent.label"),
        url: `/chatbots/${chatbotId}/ai-agents`,
        icon: BrainIcon,
      },
      {
        title: t("fields.automatedResponses.label"),
        url: `/chatbots/${chatbotId}/automated-responses`,
        icon: AtomIcon,
      },
      {
        title: t("fields.broadcasts.label"),
        url: `/chatbots/${chatbotId}/broadcasts`,
        icon: RadioIcon,
      },
      // {
      //   title: t("fields.tools.label"),
      //   url: `/chatbots/${chatbotId}/tools`,
      //   icon: WrenchIcon,
      // },
      {
        title: t("fields.settings.label"),
        url: `/chatbots/${chatbotId}/settings/general`,
        icon: SlidersHorizontalIcon,
      },
    ],
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="px-2">
        <ChatbotSwitcher chatbots={chatbots} />
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
