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

export type PortalNavItem = {
  title: string
  url: string
  icon?: LucideIcon
  /** Open in a new tab via a raw anchor (`target="_blank"`). */
  external?: boolean
  /** Force the active highlight regardless of the current pathname. */
  isActive?: boolean
}

type Props = {
  items: PortalNavItem[]
  label?: string
  /**
   * Render items as full-navigation anchors instead of client-side `Link`s.
   * Required when the items target a different Next.js zone (e.g. the manage
   * sidebar linking into the `/portal/*` app, or vice versa).
   */
  crossZone?: boolean
}

export function NavMain({ items, label, crossZone = false }: Props) {
  const pathname = usePathname()

  return (
    <SidebarGroup>
      {label && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
      <SidebarMenu>
        {items.map((item) => {
          const isActive =
            item.isActive === true ||
            pathname === item.url ||
            pathname.startsWith(`${item.url}/`)
          const linkClass = `flex w-full items-center gap-2 p-2 ${isActive ? "dark:text-gray-50" : "dark:text-gray-400"}`
          const content = (
            <>
              {item.icon && <item.icon className="size-5 shrink-0" />}
              <span>{item.title}</span>
            </>
          )
          return (
            <SidebarMenuItem key={item.url}>
              <SidebarMenuButton
                className="h-9 cursor-pointer p-0"
                isActive={isActive}
                tooltip={item.title}
              >
                {crossZone || item.external ? (
                  <a
                    className={linkClass}
                    href={item.url}
                    rel={item.external ? "noopener noreferrer" : undefined}
                    target={item.external ? "_blank" : undefined}
                  >
                    {content}
                  </a>
                ) : (
                  <Link className={linkClass} href={item.url}>
                    {content}
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
