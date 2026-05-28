"use client"

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@chatbotx.io/ui/components/ui/sidebar"
import type { LucideIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"

type NavItem = {
  title: string
  url: string
  icon?: LucideIcon
  isActive?: boolean
  items?: { title: string; url: string }[]
}

export function NavMain({
  items,
  label,
  crossZone = false,
}: {
  items: NavItem[]
  label?: string
  crossZone?: boolean
}) {
  const pathname = usePathname()

  return (
    <SidebarGroup>
      {label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
      <SidebarMenu>
        {items.map((item) => {
          const isActive = pathname.startsWith(item.url) || item.isActive
          const linkClass = `flex w-full items-center gap-2 p-2 ${isActive ? "dark:text-gray-50" : "dark:text-gray-400"}`
          return (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                className="h-9 cursor-pointer p-0"
                isActive={isActive}
                tooltip={item.title}
              >
                {crossZone ? (
                  // Cross-zone: use <a> to force full navigation to portal app
                  <a className={linkClass} href={item.url}>
                    {item.icon && <item.icon className="size-5 shrink-0" />}
                    <span>{item.title}</span>
                  </a>
                ) : (
                  <Link className={linkClass} href={item.url}>
                    {item.icon && <item.icon className="size-5 shrink-0" />}
                    <span>{item.title}</span>
                  </Link>
                )}
              </SidebarMenuButton>
            </SidebarMenuItem>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}
