"use client"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarRail,
} from "@aha.chat/ui/components/ui/sidebar"
import { useTranslate } from "@tolgee/react"
import {
  Atom,
  ChartPie,
  MessageCircleMore,
  Radio,
  SlidersHorizontal,
  Users,
  Workflow,
  Wrench,
} from "lucide-react"
import { type ComponentProps, use } from "react"
import { ChatbotSwitcher } from "@/components/chatbot-switcher"
import { NavMain } from "@/components/nav-main"
import { NavUser } from "@/components/nav-user"
import type { ChatbotResource } from "@/features/chatbots/schemas"

export function AppSidebar({
  chatbotId,
  allChatbotsPromise,
  ...props
}: ComponentProps<typeof Sidebar> & {
  chatbotId: string
  allChatbotsPromise: Promise<{ chatbots: ChatbotResource[] }>
}) {
  const { t } = useTranslate()

  const { chatbots } = use(allChatbotsPromise)

  const data = {
    user: {
      name: "shadcn",
      email: "m@example.com",
      avatar: "/avatars/shadcn.jpg",
    },
    navMain: [
      {
        title: t("common.analytics"),
        url: `/chatbots/${chatbotId}/dashboard`,
        icon: ChartPie,
        isActive: true,
      },
      {
        title: t("common.inbox"),
        url: `/chatbots/${chatbotId}/inbox`,
        icon: MessageCircleMore,
      },
      {
        title: t("common.flows"),
        url: `/chatbots/${chatbotId}/flows`,
        icon: Workflow,
      },
      {
        title: t("common.contacts"),
        url: `/chatbots/${chatbotId}/contacts`,
        icon: Users,
      },
      {
        title: t("common.automated_responses"),
        url: `/chatbots/${chatbotId}/automated-responses`,
        icon: Atom,
      },
      {
        title: t("common.broadcasts"),
        url: `/chatbots/${chatbotId}/broadcasts`,
        icon: Radio,
      },
      {
        title: t("common.tools"),
        url: `/chatbots/${chatbotId}/tools`,
        icon: Wrench,
      },
      {
        title: t("common.settings"),
        url: `/chatbots/${chatbotId}/settings/general`,
        icon: SlidersHorizontal,
      },
    ],
  }

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <ChatbotSwitcher chatbots={chatbots} />
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
