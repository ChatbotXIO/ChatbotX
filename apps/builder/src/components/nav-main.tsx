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
  crossZone?: boolean
  disabled?: boolean
}

function NavItemContent({
  item,
  className,
  isDisabled,
  isCrossZone,
}: {
  item: NavItem
  className: string
  isDisabled: boolean
  isCrossZone: boolean
}) {
  const label = (
    <>
      {item.icon && <item.icon className="size-5 shrink-0" />}
      <span>{item.title}</span>
    </>
  )

  if (isDisabled) {
    return <span className={className}>{label}</span>
  }

  if (isCrossZone) {
    // Cross-zone: use <a> to force full navigation outside the Next router
    return (
      <a
        className={className}
        href={item.url}
        rel="noopener noreferrer"
        target="_blank"
      >
        {label}
      </a>
    )
  }

  return (
    <Link className={className} href={item.url}>
      {label}
    </Link>
  )
}

export function NavMain({
  items,
  label,
  crossZone = false,
  disabledTooltip,
}: {
  items: NavItem[]
  label?: string
  crossZone?: boolean
  disabledTooltip?: string
}) {
  const pathname = usePathname()

  return (
    <SidebarGroup>
      {label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
      <SidebarMenu>
        {items.map((item) => {
          const isActive = pathname.startsWith(item.url) || item.isActive
          const linkClass = `flex w-full items-center gap-2 p-2 ${isActive ? "dark:text-gray-50" : "dark:text-gray-400"}`
          const isDisabled = Boolean(item.disabled)
          return (
            <SidebarMenuItem key={item.title}>
              <SidebarMenuButton
                aria-disabled={isDisabled}
                className="h-9 cursor-pointer p-0"
                isActive={isActive}
                tooltip={isDisabled ? disabledTooltip : item.title}
              >
                <NavItemContent
                  className={linkClass}
                  isCrossZone={crossZone || Boolean(item.crossZone)}
                  isDisabled={isDisabled}
                  item={item}
                />
              </SidebarMenuButton>
            </SidebarMenuItem>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}
