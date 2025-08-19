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
import { ChevronsUpDown, Plus } from "lucide-react"
import { useState } from "react"

export function ChatbotSwitcher({ chatbots }: { chatbots: ChatbotModel[] }) {
  const { isMobile } = useSidebar()
  const [activeChatbot, setActiveChatbot] = useState<ChatbotModel | undefined>(
    chatbots[0],
  )

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
                <span className="truncate text-xs">{activeChatbot?.plan}</span>
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
              Chatbots
            </DropdownMenuLabel>
            {chatbots.map((chatbot) => (
              <DropdownMenuItem
                className="gap-2 p-2"
                key={chatbot.name}
                onClick={() => setActiveChatbot(chatbot)}
              >
                <Avatar className="rounded-lg border">
                  <AvatarImage
                    alt={activeChatbot?.name}
                    src={activeChatbot?.logo ?? ""}
                  />
                  <AvatarFallback className="rounded">
                    {activeChatbot?.name?.charAt(0)}
                  </AvatarFallback>
                </Avatar>
                {chatbot.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2 p-2">
              <div className="flex size-6 items-center justify-center rounded-md border bg-background">
                <Plus className="size-4" />
              </div>
              <div className="font-medium text-muted-foreground">
                Add chatbot
              </div>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
