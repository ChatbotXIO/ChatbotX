"use client"

import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@chatbotx.io/ui/components/ui/sidebar"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type { ComponentType } from "react"

/**
 * Componente genérico de ícone — aceita qualquer componente que recebe
 * `className`. Compatível com Lucide (`LucideIcon`) e com wrappers de
 * outras libs (ex.: Iconsax via wrapIconsax no app-sidebar).
 */
type NavIcon = ComponentType<{ className?: string }>

export function NavMain({
  items,
}: {
  items: {
    title: string
    url: string
    icon?: NavIcon
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
        {items.map((item) => {
          const isActive = pathname.startsWith(item.url) || item.isActive
          return (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                className="h-9 cursor-pointer p-0"
                isActive={isActive}
                tooltip={item.title}
              >
                <Link
                  className={`flex w-full items-center gap-2 p-2 ${isActive ? "dark:text-gray-50" : "dark:text-gray-400"}`}
                  href={item.url}
                >
                  {item.icon && <item.icon className="size-5 shrink-0" />}
                  <span>{item.title}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}
