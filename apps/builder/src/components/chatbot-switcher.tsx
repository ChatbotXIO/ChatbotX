"use client"

import type { ChatbotModel } from "@aha.chat/database/types"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@aha.chat/ui/components/ui/avatar"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@aha.chat/ui/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@aha.chat/ui/components/ui/sidebar"
import { cn } from "@aha.chat/ui/lib/utils"
import { ChevronsUpDown, PlusCircle } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"

export function ChatbotSwitcher({ chatbots }: { chatbots: ChatbotModel[] }) {
  const { isMobile } = useSidebar()
  const params = useParams<{ chatbotId: string }>()

  const [activeChatbot, setActiveChatbot] = useState<ChatbotModel | null>(null)
  const t = useTranslations()

  useEffect(() => {
    const foundChatbot = chatbots.find(
      (chatbot) => chatbot.id === params.chatbotId,
    )
    setActiveChatbot(foundChatbot ?? null)
  }, [chatbots, params.chatbotId])

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              size="lg"
            >
              <Avatar className="rounded-lg border">
                <AvatarImage
                  alt={activeChatbot?.name}
                  src={activeChatbot?.logo ?? ""}
                />
                <AvatarFallback className="rounded">
                  {activeChatbot?.name?.slice(0, 2) || "  "}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">
                  {activeChatbot?.name}
                </span>
                {/* <span className="truncate text-xs">{activeChatbot?.plan}</span> */}
              </div>
              <ChevronsUpDown className="ml-auto" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-muted-foreground text-xs">
              {t("chatbots.list.title")}
            </DropdownMenuLabel>
            {chatbots.map((chatbot) => (
              <DropdownMenuItem
                asChild
                className={cn(
                  "gap-2 p-2",
                  activeChatbot?.id === chatbot.id &&
                    "bg-sidebar-accent text-sidebar-accent-foreground",
                )}
                key={chatbot.name}
                onClick={() => setActiveChatbot(chatbot)}
              >
                <Link href={`/chatbots/${chatbot.id}/dashboard`}>
                  <Avatar className="rounded-lg border">
                    <AvatarImage alt={chatbot.name} src={chatbot.logo ?? ""} />
                    <AvatarFallback className="rounded">
                      {chatbot.name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  {chatbot.name}
                </Link>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild className="gap-2 p-2">
              <Link
                className="gap-4 font-medium text-muted-foreground"
                href="/channels/create"
              >
                <PlusCircle className="ml-2 size-4" />
                {t("actions.addFeature", {
                  feature: t("fields.chatbot.label"),
                })}
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
