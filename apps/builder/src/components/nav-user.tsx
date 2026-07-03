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
import { ChevronsUpDown, Crown, Settings2, ShieldCheck } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { UpgradePlanDialog } from "@/enterprise/features/billing/upgrade-plan-dialog"
import { isCloud } from "@/env"
import { SignOut } from "@/features/auth/sign-out"
import { LangSelector } from "./lang-selector"
import { ThemeSwitcher } from "./theme-switcher"

export function NavUser({
  user,
  isSuperAdmin,
  isPlatformAdmin,
  planName,
}: {
  user: {
    name: string
    email: string
    avatar: string
  }
  isSuperAdmin?: boolean
  isPlatformAdmin?: boolean
  planName?: string | null
}) {
  const { isMobile } = useSidebar()
  const t = useTranslations()
  const [upgradeOpen, setUpgradeOpen] = useState(false)

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        {isCloud() && (
          <UpgradePlanDialog onOpenChange={setUpgradeOpen} open={upgradeOpen} />
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              size="lg"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarImage alt={user.name} src={user.avatar} />
                <AvatarFallback className="rounded-lg">
                  {user.name.slice(0, 2) || "  "}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{user.name}</span>
                <span className="truncate text-muted-foreground text-xs">
                  {user.email}
                </span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage alt={user.name} src={user.avatar} />
                  <AvatarFallback className="rounded-lg">
                    {user.name.slice(0, 2) || "  "}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{user.name}</span>
                  <span className="truncate text-muted-foreground text-xs">
                    {user.email}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {/* Plan + upgrade is cloud-only; self-hosted editions get everything free. */}
            {isCloud() && (
              <>
                <DropdownMenuLabel className="font-normal text-muted-foreground text-xs">
                  {t("billing.plan.label", {
                    plan: planName ?? t("billing.plan.free"),
                  })}
                </DropdownMenuLabel>
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    onSelect={(e) => {
                      e.preventDefault()
                      setUpgradeOpen(true)
                    }}
                  >
                    <Crown className="mr-2 h-4 w-4" />
                    {t("actions.upgradePlan")}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuGroup>
              <DropdownMenuItem>
                Language
                <LangSelector />
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem className="justify-between">
                Theme
                <ThemeSwitcher />
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            {/* <DropdownMenuGroup>
              <DropdownMenuItem>
                <BadgeCheck />
                Account
              </DropdownMenuItem>
              <DropdownMenuItem>
                <Bell />
                Notifications
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator /> */}
            {(isSuperAdmin || isPlatformAdmin) && (
              <>
                <DropdownMenuGroup>
                  {isSuperAdmin && (
                    <DropdownMenuItem asChild>
                      <Link href="/admin">
                        <ShieldCheck className="h-4 w-4" />
                        {t("actions.admin")}
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {isPlatformAdmin && (
                    <DropdownMenuItem asChild>
                      <Link href="/manage">
                        <Settings2 className="h-4 w-4" />
                        {t("actions.manage")}
                      </Link>
                    </DropdownMenuItem>
                  )}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem asChild>
              <SignOut />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
