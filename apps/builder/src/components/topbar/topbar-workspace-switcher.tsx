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
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { ChevronsUpDown, PlusCircle } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import type { WorkspaceResource } from "@/features/workspaces/schema/resource"
import { useWorkspaceId } from "@/hooks/routing"

/**
 * Versão do WorkspaceSwitcher pro `<WorkspaceTopbar>`. Diferente do original
 * (que vive no sidebar): trigger é um Button compacto com avatar + nome,
 * sem dependência de SidebarProvider.
 */
export function TopbarWorkspaceSwitcher({
  workspaces,
}: {
  workspaces: WorkspaceResource[]
}) {
  const workspaceId = useWorkspaceId()
  const t = useTranslations()

  const [activeWorkspace, setActiveWorkspace] =
    useState<WorkspaceResource | null>(null)

  useEffect(() => {
    const foundWorkspace = workspaces.find(
      (workspace) => workspace.id === workspaceId,
    )
    setActiveWorkspace(foundWorkspace ?? null)
  }, [workspaces, workspaceId])

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={activeWorkspace?.name ?? "Workspace"}
          className="h-9 gap-2 px-2"
          variant="ghost"
        >
          <Avatar className="size-6 rounded">
            <AvatarImage
              alt={activeWorkspace?.name}
              src={activeWorkspace?.logo ?? ""}
            />
            <AvatarFallback className="rounded font-medium text-[10px]">
              {activeWorkspace?.name?.slice(0, 2).toUpperCase() || "··"}
            </AvatarFallback>
          </Avatar>
          <span className="hidden max-w-[140px] truncate text-sm md:block">
            {activeWorkspace?.name}
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56" sideOffset={4}>
        <DropdownMenuLabel className="text-muted-foreground text-xs">
          {t("workspaces.list.title")}
        </DropdownMenuLabel>
        {workspaces.map((workspace) => (
          <DropdownMenuItem
            asChild
            className={cn(
              "gap-2 p-2",
              activeWorkspace?.id === workspace.id &&
                "bg-accent text-accent-foreground",
            )}
            key={workspace.name}
            onClick={() => setActiveWorkspace(workspace)}
          >
            <Link href={`/space/${workspace.id}/dashboard`}>
              <Avatar className="size-6 rounded border">
                <AvatarImage alt={workspace.name} src={workspace.logo ?? ""} />
                <AvatarFallback className="rounded font-medium text-[10px]">
                  {workspace.name.slice(0, 2).toUpperCase() || "··"}
                </AvatarFallback>
              </Avatar>
              {workspace.name}
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className="gap-2 p-2">
          <Link
            className="gap-4 font-medium text-muted-foreground"
            href="/channels/create"
          >
            <PlusCircle className="ml-2 size-4" />
            {t("actions.addFeature", {
              feature: t("fields.workspace.label"),
            })}
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
