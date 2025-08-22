"use client"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@aha.chat/ui/dropdown-menu"
import {
  SidebarGroup,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@aha.chat/ui/sidebar"
import type { LucideIcon } from "lucide-react"
import { Folder, Forward, MoreHorizontal, Trash2 } from "lucide-react"
import { useTranslations } from "next-intl"

type NavProjectsProps = {
  items: Array<{
    name: string
    href: string
    icon: LucideIcon
  }>
}

export function NavProjects({ items }: NavProjectsProps) {
  const t = useTranslations()

  return (
    <SidebarGroup className="group-data-[collapsible=icon]:hidden">
      {items.map((item) => (
        <SidebarMenuItem key={item.name}>
          <SidebarMenuButton asChild>
            <a href={item.href}>
              <item.icon />
              <span>{item.name}</span>
            </a>
          </SidebarMenuButton>
          <DropdownMenuTrigger asChild>
            <SidebarMenuAction showOnHover>
              <MoreHorizontal />
              <span className="sr-only">More</span>
            </SidebarMenuAction>
          </DropdownMenuTrigger>
          <DropdownMenu>
            <DropdownMenuContent>
              <DropdownMenuItem>
                <Folder className="text-muted-foreground" />
                <span>{t("actions.viewProject")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Forward className="text-muted-foreground" />
                <span>{t("actions.shareProject")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Trash2 className="text-muted-foreground" />
                <span>{t("actions.deleteProject")}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      ))}
      <SidebarMenuButton className="text-sidebar-foreground/70">
        <MoreHorizontal className="text-sidebar-foreground/70" />
      </SidebarMenuButton>
    </SidebarGroup>
  )
}
