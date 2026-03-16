"use client"

import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@aha.chat/ui/components/ui/sidebar"
import type { LucideIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

export function NavMain({
  items,
}: {
  items: {
    title: string
    url: string
    icon?: LucideIcon
    isActive?: boolean
    items?: {
      title: string
      url: string
    }[]
  }[]
}) {
  const pathname = usePathname()

  return (
    <SidebarGroup>
      <SidebarMenu>
        {items.map((item) => (
          <SidebarMenuItem key={item.title}>
            <SidebarMenuButton
              className="h-9"
              isActive={pathname.startsWith(item.url)}
              tooltip={item.title}
            >
              <Link className="flex items-center gap-2" href={item.url}>
                {item.icon && <item.icon className="size-5" />}
                <span>{item.title}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  )
}
