"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { format } from "date-fns"
import {
  ExternalLinkIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  Trash2Icon,
  UsersIcon,
} from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import { CreateWorkspaceDialog } from "@/features/workspaces/create-workspace-dialog"
import { DeleteWorkspaceDialog } from "@/features/workspaces/delete-workspace-dialog"
import type { OrgWorkspaceRow } from "@/features/workspaces/queries/list-org-workspaces"
import { RenameWorkspaceDialog } from "@/features/workspaces/rename-workspace-dialog"

export function ManageWorkspacesList({
  workspaces,
}: {
  workspaces: OrgWorkspaceRow[]
}) {
  const t = useTranslations("manageWorkspaces")
  const [search, setSearch] = useState("")
  const [createOpen, setCreateOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<OrgWorkspaceRow | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<OrgWorkspaceRow | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) {
      return workspaces
    }
    return workspaces.filter((w) => w.name.toLowerCase().includes(q))
  }, [workspaces, search])

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-semibold text-foreground text-xl">{t("title")}</h2>
        <p className="mt-1 text-sm text-text-secondary">{t("subtitle")}</p>
      </div>

      <div className="flex items-center justify-between gap-4">
        <Button onClick={() => setCreateOpen(true)} size="sm" type="button">
          <PlusIcon className="h-4 w-4" />
          {t("addWorkspace")}
        </Button>
        <div className="relative max-w-sm flex-1">
          <SearchIcon className="absolute top-2.5 left-3 h-4 w-4 text-text-secondary" />
          <Input
            className="pl-9"
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            value={search}
          />
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-white/[0.06] bg-app-surface">
        <table className="w-full">
          <thead className="border-white/[0.06] border-b bg-white/[0.02]">
            <tr>
              <th className="px-4 py-2 text-left font-medium text-text-secondary text-xs">
                {t("columns.name")}
              </th>
              <th className="px-4 py-2 text-left font-medium text-text-secondary text-xs">
                {t("columns.members")}
              </th>
              <th className="px-4 py-2 text-left font-medium text-text-secondary text-xs">
                {t("columns.createdAt")}
              </th>
              <th className="px-4 py-2 text-right font-medium text-text-secondary text-xs">
                {t("columns.actions")}
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td
                  className="px-4 py-8 text-center text-sm text-text-secondary"
                  colSpan={4}
                >
                  {t("empty")}
                </td>
              </tr>
            ) : (
              filtered.map((w) => (
                <tr
                  className="border-white/[0.06] border-b last:border-b-0"
                  key={w.id}
                >
                  <td className="px-4 py-3 font-medium text-foreground text-sm">
                    {w.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary">
                    <div className="flex items-center gap-1.5">
                      <UsersIcon className="h-3.5 w-3.5" />
                      <span>{w.memberCount}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-text-secondary">
                    {format(new Date(w.createdAt), "dd/MM/yyyy")}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Link href={`/space/${w.id}/dashboard`}>
                        <Button size="sm" type="button" variant="ghost">
                          <ExternalLinkIcon className="h-4 w-4" />
                          {t("open")}
                        </Button>
                      </Link>
                      <Button
                        onClick={() => setRenameTarget(w)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        <PencilIcon className="h-4 w-4" />
                        {t("rename")}
                      </Button>
                      <Button
                        className="text-destructive"
                        onClick={() => setDeleteTarget(w)}
                        size="sm"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2Icon className="h-4 w-4" />
                        {t("delete")}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <CreateWorkspaceDialog onOpenChange={setCreateOpen} open={createOpen} />
      <RenameWorkspaceDialog
        onOpenChange={() => setRenameTarget(null)}
        open={Boolean(renameTarget)}
        workspace={renameTarget}
      />
      <DeleteWorkspaceDialog
        onOpenChange={() => setDeleteTarget(null)}
        open={Boolean(deleteTarget)}
        workspace={deleteTarget}
      />
    </div>
  )
}
