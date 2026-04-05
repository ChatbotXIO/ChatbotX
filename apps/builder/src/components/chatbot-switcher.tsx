"use client"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@chatbotx.io/ui/components/ui/sidebar"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { ChevronsUpDown, PlusCircle } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import type { WorkspaceResource } from "@/features/workspaces/schema/resource"
import { useWorkspaceId } from "@/hooks/routing"

export function ChatbotSwitcher({
  workspaces,
}: {
  workspaces: WorkspaceResource[]
}) {
  const { isMobile } = useSidebar()
  const workspaceId = useWorkspaceId()

  const [activeChatbot, setActiveChatbot] = useState<WorkspaceResource | null>(
    null,
  )
  const t = useTranslations()

  useEffect(() => {
    const foundChatbot = workspaces.find(
      (workspace) => workspace.id === workspaceId,
    )
    setActiveChatbot(foundChatbot ?? null)
  }, [workspaces, workspaceId])

  return (
    <SidebarMenu>
      <SidebarMenuItem className="flex h-12 items-center justify-center">
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
                <AvatarFallback className="rounded font-medium">
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
              {t("workspaces.list.title")}
            </DropdownMenuLabel>
            {workspaces.map((workspace) => (
              <DropdownMenuItem
                asChild
                className={cn(
                  "gap-2 p-2",
                  activeChatbot?.id === workspace.id &&
                    "bg-sidebar-accent text-sidebar-accent-foreground",
                )}
                key={workspace.name}
                onClick={() => setActiveChatbot(workspace)}
              >
                <Link href={`/space/${workspace.id}/dashboard`}>
                  <Avatar className="rounded-lg border">
                    <AvatarImage
                      alt={workspace.name}
                      src={workspace.logo ?? ""}
                    />
                    <AvatarFallback className="rounded font-medium">
                      {workspace.name.slice(0, 2) || "  "}
                    </AvatarFallback>
                  </Avatar>
                  {workspace.name}
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
                  feature: t("fields.workspace.label"),
                })}
              </Link>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
