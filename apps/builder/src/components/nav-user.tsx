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
import { CreditCard, Crown, Settings2, ShieldCheck } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { UpgradePlanDialog } from "@/enterprise/features/billing/upgrade-plan-dialog"
import { isCloud } from "@/env"
import { SignOut } from "@/features/auth/sign-out"
import { EditProfileDialog } from "@/features/workspaces/components/edit-profile-dialog"
import { RefreshAllChannelTokensButton } from "@/features/workspaces/components/refresh-all-channel-tokens-button"
import { useUserAvatarUrl } from "@/lib/auth/avatar"
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
  const avatarUrl = useUserAvatarUrl(user.avatar)

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        {isCloud() && (
          <UpgradePlanDialog onOpenChange={setUpgradeOpen} open={upgradeOpen} />
        )}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                size="lg"
              >
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage alt={user.name} src={avatarUrl ?? ""} />
                  <AvatarFallback className="rounded-lg">
                    {user.name.slice(0, 2) || "  "}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-start text-sm leading-tight">
                  <span className="truncate font-semibold">{user.name}</span>
                  <span className="truncate text-muted-foreground text-xs">
                    {user.email}
                  </span>
                </div>
              </SidebarMenuButton>
            }
          />
          <DropdownMenuContent
            align="end"
            className="w-(--anchor-width) min-w-72 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-start text-sm">
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarImage alt={user.name} src={avatarUrl ?? ""} />
                    <AvatarFallback className="rounded-lg">
                      {user.name.slice(0, 2) || "  "}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-start text-sm leading-tight">
                    <span className="truncate font-semibold">{user.name}</span>
                    <span className="truncate text-muted-foreground text-xs">
                      {user.email}
                    </span>
                  </div>
                  <EditProfileDialog
                    className="ms-auto shrink-0"
                    user={{
                      name: user.name,
                      email: user.email,
                      image: user.avatar,
                    }}
                  />
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            {/* Plan + upgrade is cloud-only; self-hosted editions get everything free. */}
            {isCloud() && (
              <>
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="font-normal text-muted-foreground text-xs">
                    {t("billing.plan.label", {
                      plan: planName ?? t("billing.plan.free"),
                    })}
                  </DropdownMenuLabel>
                </DropdownMenuGroup>
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    closeOnClick={false}
                    onClick={() => {
                      setUpgradeOpen(true)
                    }}
                  >
                    <Crown className="me-2 h-4 w-4" />
                    {t("actions.upgradePlan")}
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    render={
                      <Link href="/portal/billing">
                        <CreditCard className="me-2 h-4 w-4" />
                        {t("billing.title")}
                      </Link>
                    }
                  />
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuGroup>
              <DropdownMenuItem closeOnClick={false}>
                {t("fields.language.label")}
                <LangSelector />
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                className="justify-between"
                closeOnClick={false}
              >
                {t("fields.theme.label")}
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
                    <DropdownMenuItem
                      render={
                        <Link href="/admin">
                          <ShieldCheck className="h-4 w-4" />
                          {t("actions.admin")}
                        </Link>
                      }
                    />
                  )}
                  {isCloud() && isPlatformAdmin && (
                    <DropdownMenuItem
                      render={
                        <Link href="/manage">
                          <Settings2 className="h-4 w-4" />
                          {t("actions.manage")}
                        </Link>
                      }
                    />
                  )}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem render={<RefreshAllChannelTokensButton />} />
            <DropdownMenuItem render={<SignOut />} />
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
