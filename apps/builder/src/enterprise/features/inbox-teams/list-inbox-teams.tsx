"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { SearchIcon, SettingsIcon, Trash2Icon, UsersIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { use, useMemo, useState } from "react"
import type { listWorkspaceMembers } from "@/features/workspace-members/queries"
import type { ListWorkspaceMembersResponse } from "@/features/workspace-members/schema/query"
import { CreateInboxTeamDialog } from "./create-inbox-team-dialog"
import { DeleteInboxTeamDialog } from "./delete-inbox-team-dialog"
import { ManageInboxTeamDialog } from "./manage-inbox-team-dialog"
import type { listInboxTeams } from "./queries"
import type { ListInboxTeamsResponse } from "./schema/action"

type Team = ListInboxTeamsResponse["data"][number]

type ListInboxTeamsProps = {
  workspaceId: string
  promises: Promise<
    [
      Awaited<ReturnType<typeof listInboxTeams>>,
      Awaited<ReturnType<typeof listWorkspaceMembers>>,
    ]
  >
}

function TeamRow({
  team,
  onManage,
  onDelete,
}: {
  team: Team
  onManage: (team: Team) => void
  onDelete: (team: Team) => void
}) {
  const t = useTranslations("inboxTeams")
  const memberCount = team.inboxTeamMembers?.length ?? 0
  const description =
    (team as Team & { description?: string | null }).description ?? null

  return (
    <div className="flex items-center gap-3 rounded-md border border-white/[0.06] bg-app-surface px-4 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/30">
        <UsersIcon className="h-4 w-4 text-primary" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-foreground">{team.name}</span>
          <span className="text-text-secondary text-xs">
            (ID: {team.id.slice(-6)})
          </span>
        </div>
        <div className="mt-0.5 truncate text-text-secondary text-xs">
          {description?.trim()
            ? description
            : t("membersCount", { count: memberCount })}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          className="text-destructive"
          onClick={() => onDelete(team)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Trash2Icon className="h-4 w-4" />
          {t("delete")}
        </Button>
        <Button
          onClick={() => onManage(team)}
          size="sm"
          type="button"
          variant="outline"
        >
          <SettingsIcon className="h-4 w-4" />
          {t("manage")}
        </Button>
      </div>
    </div>
  )
}

export function ListInboxTeams({ workspaceId, promises }: ListInboxTeamsProps) {
  const t = useTranslations("inboxTeams")
  const [{ data: allInboxTeams }, { data: allWorkspaceMembers }] = use(promises)

  const [search, setSearch] = useState("")
  const [manageTeam, setManageTeam] = useState<Team | null>(null)
  const [deleteTeam, setDeleteTeam] = useState<Team | null>(null)

  const teams: ListInboxTeamsResponse["data"] = allInboxTeams ?? []
  const members: ListWorkspaceMembersResponse["data"] =
    allWorkspaceMembers ?? []

  const filtered = useMemo(() => {
    if (!search.trim()) {
      return teams
    }
    const q = search.toLowerCase()
    return teams.filter((tm) => tm.name.toLowerCase().includes(q))
  }, [teams, search])

  return (
    <div className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 font-semibold text-foreground text-xl">
          <UsersIcon className="h-5 w-5" />
          {t("title")}
        </h2>
        <p className="mt-1 text-sm text-text-secondary">{t("subtitle")}</p>
      </div>

      <div className="flex items-center justify-between gap-4">
        <CreateInboxTeamDialog
          workspaceId={workspaceId}
          workspaceMembers={members}
        />
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

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <div className="rounded-md border border-white/[0.06] bg-app-surface p-8 text-center text-sm text-text-secondary">
            {search.trim()
              ? "Nenhuma equipe encontrada."
              : "Nenhuma equipe criada ainda."}
          </div>
        ) : (
          filtered.map((team) => (
            <TeamRow
              key={team.id}
              onDelete={setDeleteTeam}
              onManage={setManageTeam}
              team={team}
            />
          ))
        )}
      </div>

      <ManageInboxTeamDialog
        inboxTeam={manageTeam}
        onOpenChange={() => setManageTeam(null)}
        open={Boolean(manageTeam)}
        workspaceId={workspaceId}
        workspaceMembers={members}
      />
      <DeleteInboxTeamDialog
        inboxTeam={deleteTeam}
        onOpenChange={() => setDeleteTeam(null)}
        open={Boolean(deleteTeam)}
        workspaceId={workspaceId}
      />
    </div>
  )
}
