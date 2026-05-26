"use client"

import { cn } from "@chatbotx.io/ui/lib/utils"
import { Notification, UserSquare } from "iconsax-reactjs"
import Link from "next/link"
import { useParams, usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { type IconsaxComponent, wrapIconsax } from "@/components/iconsax-icon"

const ProfileIcon = wrapIconsax(UserSquare as IconsaxComponent)
const BellIcon = wrapIconsax(Notification as IconsaxComponent)

export function PersonalSettingsSidebar() {
  const t = useTranslations("personalSettings")
  const pathname = usePathname()
  const params = useParams()
  const workspaceId = params.workspaceId as string

  const base = `/space/${workspaceId}/account`

  const items = [
    {
      label: t("profile"),
      href: base,
      icon: ProfileIcon,
      active:
        pathname === base ||
        (pathname.startsWith(`${base}/`) &&
          !pathname.startsWith(`${base}/notifications`)),
    },
    {
      label: t("notifications"),
      href: `${base}/notifications`,
      icon: BellIcon,
      active: pathname.startsWith(`${base}/notifications`),
    },
  ]

  return (
    <aside className="w-[215px] shrink-0 overflow-y-auto border-r bg-sidebar text-sidebar-foreground">
      <div className="flex items-center px-2 pt-3 pb-2">
        <h2 className="truncate font-semibold text-base">{t("title")}</h2>
      </div>
      <nav className="flex flex-col gap-0.5 px-2 py-2">
        {items.map((item) => {
          const Icon = item.icon
          return (
            <Link
              className={cn(
                "flex h-8 items-center gap-2 rounded-md px-2 text-sm transition-colors",
                item.active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "hover:bg-sidebar-accent/50",
              )}
              href={item.href}
              key={item.href}
            >
              <Icon className="size-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
