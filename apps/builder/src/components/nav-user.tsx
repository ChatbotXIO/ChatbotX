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
import {
  ArrowSwapVertical,
  Buildings2,
  Crown,
  ShieldTick,
} from "iconsax-reactjs"
import { type IconsaxComponent, wrapIconsax } from "@/components/iconsax-icon"

const BadgeCheck = wrapIconsax(ShieldTick as IconsaxComponent)
const ChevronsUpDown = wrapIconsax(ArrowSwapVertical as IconsaxComponent)
const CrownIcon = wrapIconsax(Crown as IconsaxComponent)
const OrgIcon = wrapIconsax(Buildings2 as IconsaxComponent)

import Link from "next/link"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import {
  ACTIVITY_STATUSES,
  type ActivityStatus,
  ActivityStatusDot,
  isActivityStatus,
} from "@/features/account/activity-status"
import { SignOut } from "@/features/auth/sign-out"
import { authClient } from "@/lib/auth/auth-client"

export function NavUser({
  user,
}: {
  user: {
    name: string
    email: string
    avatar: string
  }
}) {
  const { isMobile } = useSidebar()
  const t = useTranslations()
  const tStatus = useTranslations("personalSettings.activityStatus")
  const params = useParams()
  const workspaceId = params.workspaceId as string

  // Status real do user (session). Default "available" se ainda não setado.
  const { data: session } = authClient.useSession()
  const rawStatus = (session?.user as unknown as { activityStatus?: unknown })
    ?.activityStatus
  const currentStatus: ActivityStatus = isActivityStatus(rawStatus)
    ? rawStatus
    : "available"

  const handleStatusChange = async (next: ActivityStatus) => {
    if (next === currentStatus) {
      return
    }
    const { error } = await authClient.updateUser({
      activityStatus: next,
    } as unknown as Parameters<typeof authClient.updateUser>[0])
    if (error) {
      toast.error(error.message ?? tStatus("updateError"))
      return
    }
    toast.success(tStatus("updateSuccess", { status: tStatus(next) }))
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              className="overflow-visible! data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              size="lg"
            >
              <div className="relative">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage alt={user.name} src={user.avatar} />
                  <AvatarFallback className="rounded-lg">
                    {user.name.slice(0, 2) || "  "}
                  </AvatarFallback>
                </Avatar>
                <ActivityStatusDot
                  className="absolute right-0 bottom-0 size-2 translate-x-1/2 translate-y-1/2 ring-2 ring-sidebar"
                  status={currentStatus}
                />
              </div>
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
                <div className="relative">
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarImage alt={user.name} src={user.avatar} />
                    <AvatarFallback className="rounded-lg">
                      {user.name.slice(0, 2) || "  "}
                    </AvatarFallback>
                  </Avatar>
                  <ActivityStatusDot
                    className="absolute right-0 bottom-0 size-2 translate-x-1/2 translate-y-1/2 ring-2 ring-popover"
                    status={currentStatus}
                  />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{user.name}</span>
                  <span className="truncate text-muted-foreground text-xs">
                    {user.email}
                  </span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="px-2 py-1 font-medium text-text-secondary text-xs uppercase">
              {tStatus("sectionLabel")}
            </DropdownMenuLabel>
            <DropdownMenuGroup>
              {ACTIVITY_STATUSES.map((s) => (
                <DropdownMenuItem
                  className="gap-2"
                  key={s}
                  onClick={() => handleStatusChange(s)}
                >
                  <ActivityStatusDot status={s} />
                  <span>{tStatus(s)}</span>
                  {s === currentStatus && (
                    <span className="ml-auto text-text-secondary text-xs">
                      •
                    </span>
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem>
                <CrownIcon className="mr-2 size-4" />
                {t("actions.upgradeToPro")}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem asChild>
                <Link href={`/space/${workspaceId}/account`}>
                  <BadgeCheck />
                  {t("personalSettings.account")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/manage/workspaces">
                  <OrgIcon />
                  {t("organization.manage")}
                </Link>
              </DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <SignOut />
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
