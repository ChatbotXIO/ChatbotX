"use client"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@chatbotx.io/ui/components/ui/sidebar"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { PlusIcon, SearchIcon, SettingsIcon } from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"
import { CreateWorkspaceDialog } from "@/features/workspaces/create-workspace-dialog"
import type { WorkspaceResource } from "@/features/workspaces/schema/resource"
import { useWorkspaceId } from "@/hooks/routing"

type OrganizationLite = {
  id: string
  name: string
} | null

export function WorkspaceSwitcher({
  workspaces,
  organization,
}: {
  workspaces: WorkspaceResource[]
  organization?: OrganizationLite
}) {
  const workspaceId = useWorkspaceId()
  const t = useTranslations("workspaces")

  const [activeWorkspace, setActiveWorkspace] =
    useState<WorkspaceResource | null>(null)
  const [open, setOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [search, setSearch] = useState("")

  useEffect(() => {
    const foundWorkspace = workspaces.find(
      (workspace) => workspace.id === workspaceId,
    )
    setActiveWorkspace(foundWorkspace ?? null)
  }, [workspaces, workspaceId])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) {
      return workspaces
    }
    return workspaces.filter((w) => w.name?.toLowerCase().includes(q))
  }, [workspaces, search])

  const initials = (activeWorkspace?.name || "  ").slice(0, 2).toUpperCase()

  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem className="flex h-12 items-center justify-center">
          <Popover onOpenChange={setOpen} open={open}>
            <PopoverTrigger asChild>
              <SidebarMenuButton
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                size="lg"
              >
                <Avatar className="rounded-lg border">
                  <AvatarImage
                    alt={activeWorkspace?.name}
                    src={activeWorkspace?.logo ?? ""}
                  />
                  <AvatarFallback className="rounded font-medium">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </SidebarMenuButton>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="w-64 p-2"
              side="right"
              sideOffset={4}
            >
              <div className="relative">
                <SearchIcon className="absolute top-2 left-2 size-4 text-muted-foreground" />
                <Input
                  className="pl-8"
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("searchPlaceholder")}
                  value={search}
                />
              </div>

              {organization && (
                <div className="mt-2 flex items-center justify-between gap-2 px-2 py-1.5 text-muted-foreground text-xs">
                  <span className="truncate font-medium">
                    {organization.name}
                  </span>
                  <Link
                    aria-label="Configurações da organização"
                    className="rounded p-1 hover:bg-sidebar-accent/50"
                    href="/manage/workspaces"
                    onClick={() => setOpen(false)}
                  >
                    <SettingsIcon className="size-3.5" />
                  </Link>
                </div>
              )}

              <div className="mt-1 flex flex-col gap-0.5">
                {filtered.length === 0 ? (
                  <div className="px-2 py-3 text-center text-muted-foreground text-xs">
                    Nenhum workspace encontrado.
                  </div>
                ) : (
                  filtered.map((workspace) => (
                    <Link
                      className={cn(
                        "flex items-center gap-2 rounded-md px-2 py-2 text-sm",
                        activeWorkspace?.id === workspace.id
                          ? "bg-sidebar-accent text-sidebar-accent-foreground"
                          : "hover:bg-sidebar-accent/50",
                      )}
                      href={`/space/${workspace.id}/dashboard`}
                      key={workspace.id}
                      onClick={() => setOpen(false)}
                    >
                      <Avatar className="size-6 rounded border">
                        <AvatarImage
                          alt={workspace.name}
                          src={workspace.logo ?? ""}
                        />
                        <AvatarFallback className="rounded font-medium text-[10px]">
                          {(workspace.name || "  ").slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate">{workspace.name}</span>
                    </Link>
                  ))
                )}
              </div>

              <div className="mt-1 border-white/[0.06] border-t pt-1">
                <button
                  className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-sidebar-accent/50"
                  onClick={() => {
                    setOpen(false)
                    setCreateOpen(true)
                  }}
                  type="button"
                >
                  <PlusIcon className="size-4" />
                  <span>{t("addWorkspace")}</span>
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </SidebarMenuItem>
      </SidebarMenu>

      <CreateWorkspaceDialog onOpenChange={setCreateOpen} open={createOpen} />
    </>
  )
}
