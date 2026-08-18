"use client"

import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
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
  onNavigate,
}: {
  item: NavItem
  className: string
  isDisabled: boolean
  isCrossZone: boolean
  onNavigate: () => void
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
        onClick={onNavigate}
        rel="noopener noreferrer"
        target="_blank"
      >
        {label}
      </a>
    )
  }

  return (
    <Link className={className} href={item.url} onClick={onNavigate}>
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
  const { setOpenMobile } = useSidebar()

  // On mobile the sidebar is a Sheet rendered over the page. Navigating leaves
  // it open on top of the destination, so close it as the link is followed.
  // No-op on desktop, where `openMobile` is not read.
  const closeMobileSidebar = () => setOpenMobile(false)

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
                  onNavigate={closeMobileSidebar}
                />
              </SidebarMenuButton>
            </SidebarMenuItem>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}
