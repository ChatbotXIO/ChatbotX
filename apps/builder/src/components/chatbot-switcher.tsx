"use client"

import { ChevronsUpDown, Plus } from "lucide-react"
import { useState } from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import type { Chatbot } from "@ahachat.ai/database/types"
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar"

export function ChatbotSwitcher({
  chatbots,
}: {
  chatbots: Chatbot[]
}) {
  const { isMobile } = useSidebar()
  const [activeChatbot, setActiveChatbot] = useState<Chatbot | undefined>(
    chatbots[0],
  )

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="rounded-lg border">
                <AvatarImage
                  src={activeChatbot?.logo ?? ""}
                  alt={activeChatbot?.name}
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
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            align="start"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Chatbots
            </DropdownMenuLabel>
            {chatbots.map((chatbot) => (
              <DropdownMenuItem
                key={chatbot.name}
                onClick={() => setActiveChatbot(chatbot)}
                className="gap-2 p-2"
              >
                <Avatar className="rounded-lg border">
                  <AvatarImage
                    src={activeChatbot?.logo ?? ""}
                    alt={activeChatbot?.name}
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
