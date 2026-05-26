"use client"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { BadgeCheck, Bell, Crown } from "lucide-react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { LangSelector } from "@/components/lang-selector"
import { ThemeSwitcher } from "@/components/theme-switcher"
import { SignOut } from "@/features/auth/sign-out"

/**
 * Versão do NavUser pro `<WorkspaceTopbar>`. Diferente do original:
 *  - Não usa SidebarMenu* (que requer SidebarProvider context)
 *  - Trigger é um Button simples (avatar + dropdown menu)
 *  - Posicionamento via `DropdownMenuContent align="end"` no canto direito
 */
export function TopbarUserMenu({
  user,
}: {
  user: { name: string; email: string; avatar: string }
}) {
  const t = useTranslations()
  const params = useParams()
  const workspaceId = params.workspaceId as string

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={user.name || "Usuário"}
          className="size-9 rounded-full p-0"
          variant="ghost"
        >
          <Avatar className="size-8">
            <AvatarImage alt={user.name} src={user.avatar} />
            <AvatarFallback className="text-xs">
              {user.name.slice(0, 2).toUpperCase() || "··"}
            </AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56" sideOffset={4}>
        <DropdownMenuLabel className="p-0 font-normal">
          <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
            <Avatar className="h-8 w-8 rounded-lg">
              <AvatarImage alt={user.name} src={user.avatar} />
              <AvatarFallback className="rounded-lg">
                {user.name.slice(0, 2).toUpperCase() || "  "}
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
        <DropdownMenuGroup>
          <DropdownMenuItem>
            <Crown className="mr-2 h-4 w-4" />
            {t("actions.upgradeToPro")}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem>
            Idioma
            <LangSelector />
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem>
            Tema
            <ThemeSwitcher />
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem asChild>
            <Link href={`/space/${workspaceId}/account`}>
              <BadgeCheck />
              Conta
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/space/${workspaceId}/notifications`}>
              <Bell />
              Notificações
            </Link>
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <SignOut />
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
