"use client"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
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
import { ChevronDown, PlusCircle } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import type { WorkspaceResource } from "@/features/workspaces/schema/resource"
import { useWorkspaceId } from "@/hooks/routing"

export function WorkspaceSwitcher({
  workspaces,
}: {
  workspaces: WorkspaceResource[]
}) {
  const { isMobile } = useSidebar()
  const workspaceId = useWorkspaceId()

  const [activeWorkspace, setActiveWorkspace] =
    useState<WorkspaceResource | null>(null)
  const t = useTranslations()

  useEffect(() => {
    const foundWorkspace = workspaces.find(
      (workspace) => workspace.id === workspaceId,
    )
    setActiveWorkspace(foundWorkspace ?? null)
  }, [workspaces, workspaceId])

  return (
    <SidebarMenu>
      <SidebarMenuItem className="flex h-12 items-center justify-center">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                size="lg"
              >
                <Avatar className="rounded-lg border">
                  <AvatarImage
                    alt={activeWorkspace?.name}
                    src={activeWorkspace?.logo ?? ""}
                  />
                  <AvatarFallback className="rounded font-medium">
                    {activeWorkspace?.name?.slice(0, 2) || "  "}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-start text-sm leading-tight">
                  <span className="truncate font-semibold">
                    {activeWorkspace?.name}
                  </span>
                  {/* <span className="truncate text-xs">{activeWorkspace?.plan}</span> */}
                </div>
                <ChevronDown className="ms-auto" />
              </SidebarMenuButton>
            }
          />
          <DropdownMenuContent
            align="start"
            className="w-(--anchor-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-muted-foreground text-xs">
                {t("workspaces.list.title")}
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            {workspaces.map((workspace) => (
              <DropdownMenuItem
                className={cn(
                  "gap-2 p-2",
                  activeWorkspace?.id === workspace.id &&
                    "bg-sidebar-accent text-sidebar-accent-foreground",
                )}
                key={workspace.id}
                onClick={() => setActiveWorkspace(workspace)}
                render={
                  <Link href={`/space/${workspace.id}`}>
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
                }
              />
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="gap-2 p-2"
              render={
                <Link
                  className="gap-4 font-medium text-muted-foreground"
                  href="/channels/create"
                >
                  <PlusCircle className="ms-2 size-4" />
                  {t("actions.addFeature", {
                    feature: t("fields.workspace.label"),
                  })}
                </Link>
              }
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
