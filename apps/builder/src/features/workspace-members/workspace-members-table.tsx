"use client"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { PencilIcon, SearchIcon, UsersIcon, XCircleIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { use, useMemo, useState } from "react"
import { DeleteWorkspaceMemberDialog } from "./components/delete-workspace-member"
import { InviteWorkspaceMemberDialog } from "./components/invite-workspace-member"
import { UpdateWorkspaceMemberDialog } from "./components/update-workspace-member"
import type { listWorkspaceMembers } from "./queries"
import type { ListWorkspaceMembersResponse } from "./schema/query"

type Member = ListWorkspaceMembersResponse["data"][number]

type WorkspaceMembersTableProps = {
  promises: Promise<[Awaited<ReturnType<typeof listWorkspaceMembers>>]>
}

function MemberRow({
  member,
  onEdit,
  onRevoke,
}: {
  member: Member
  onEdit: (m: Member) => void
  onRevoke: (m: Member) => void
}) {
  const t = useTranslations("admins")
  const isOwner = member.role === "owner"

  return (
    <div className="flex items-center gap-3 rounded-md border border-white/[0.06] bg-app-surface px-4 py-3">
      <Avatar className="size-9">
        <AvatarImage
          alt={member.user.name ?? ""}
          src={member.user.image ?? undefined}
        />
        <AvatarFallback>
          {(member.user.name || member.user.email || "?")
            .charAt(0)
            .toUpperCase()}
        </AvatarFallback>
      </Avatar>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-semibold text-foreground">
            {member.user.name || member.user.email}
          </span>
          <span className="text-text-secondary text-xs">
            (ID: {member.user.id.slice(-6)})
          </span>
        </div>
        <div className="mt-0.5 truncate text-text-secondary text-xs">
          {t(`roles.${member.role}`)} – {member.user.email}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Button
          className="text-destructive"
          disabled={isOwner}
          onClick={() => onRevoke(member)}
          size="sm"
          type="button"
          variant="ghost"
        >
          <XCircleIcon className="h-4 w-4" />
          {t("revoke")}
        </Button>
        <Button
          onClick={() => onEdit(member)}
          size="sm"
          type="button"
          variant="outline"
        >
          <PencilIcon className="h-4 w-4" />
          {t("edit")}
        </Button>
      </div>
    </div>
  )
}

export function WorkspaceMembersTable({
  promises,
}: WorkspaceMembersTableProps) {
  const [{ data }] = use(promises)
  const t = useTranslations("admins")

  const [search, setSearch] = useState("")
  const [editMember, setEditMember] = useState<Member | null>(null)
  const [revokeMember, setRevokeMember] = useState<Member | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) {
      return data
    }
    return data.filter((m) => {
      const name = (m.user.name ?? "").toLowerCase()
      const email = m.user.email.toLowerCase()
      return name.includes(q) || email.includes(q)
    })
  }, [data, search])

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
        <InviteWorkspaceMemberDialog />
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
              ? "Nenhum usuário encontrado."
              : "Nenhum usuário no espaço de trabalho."}
          </div>
        ) : (
          filtered.map((member) => (
            <MemberRow
              key={member.id}
              member={member}
              onEdit={setEditMember}
              onRevoke={setRevokeMember}
            />
          ))
        )}
      </div>

      <UpdateWorkspaceMemberDialog
        onOpenChange={() => setEditMember(null)}
        open={Boolean(editMember)}
        workspaceMember={editMember}
      />
      <DeleteWorkspaceMemberDialog
        onOpenChange={() => setRevokeMember(null)}
        open={Boolean(revokeMember)}
        workspaceMember={revokeMember ?? undefined}
      />
    </div>
  )
}
