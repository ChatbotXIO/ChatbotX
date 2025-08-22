"use client"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@aha.chat/ui/components/ui/sidebar"
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
import { useTranslations } from "next-intl"
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
  const t = useTranslations()
  const { chatbots } = use(allChatbotsPromise)

  const data = {
    user: {
      name: "shadcn",
      email: "m@example.com",
      avatar: "/avatars/shadcn.jpg",
    },
    navMain: [
      {
        title: t("fields.analytics.label"),
        url: `/chatbots/${chatbotId}/dashboard`,
        icon: ChartPie,
        isActive: true,
      },
      {
        title: t("fields.inbox.label"),
        url: `/chatbots/${chatbotId}/inbox`,
        icon: MessageCircleMore,
      },
      {
        title: t("fields.flows.label"),
        url: `/chatbots/${chatbotId}/flows`,
        icon: Workflow,
      },
      {
        title: t("fields.contacts.label"),
        url: `/chatbots/${chatbotId}/contacts`,
        icon: Users,
      },
      {
        title: t("fields.automatedResponses.label"),
        url: `/chatbots/${chatbotId}/automated-responses`,
        icon: Atom,
      },
      {
        title: t("fields.broadcasts.label"),
        url: `/chatbots/${chatbotId}/broadcasts`,
        icon: Radio,
      },
      {
        title: t("fields.tools.label"),
        url: `/chatbots/${chatbotId}/tools`,
        icon: Wrench,
      },
      {
        title: t("fields.settings.label"),
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
    </Sidebar>
  )
}
