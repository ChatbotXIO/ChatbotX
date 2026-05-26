"use client"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { format, isToday, isYesterday } from "date-fns"
import { ptBR } from "date-fns/locale"
import { PlusIcon, SearchIcon, Trash2Icon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { useDebouncedCallback } from "use-debounce"
import {
  getOrganizationMemberDetail,
  type OrganizationMemberDetail,
} from "../queries/get-member-detail"
import type { ListOrganizationMembersResponse } from "../schema/mutation"
import { DeleteUserDialog } from "./delete-user-dialog"
import { UserFormDialog } from "./user-form-dialog"

type WorkspaceOption = { id: string; name: string }

type OrganizationMembersListProps = {
  members: ListOrganizationMembersResponse["data"]
  workspaceOptions: WorkspaceOption[]
  currentUserId: string
  initialKeyword?: string
}

export function OrganizationMembersList({
  members,
  workspaceOptions,
  currentUserId,
  initialKeyword = "",
}: OrganizationMembersListProps) {
  const t = useTranslations()
  const router = useRouter()
  const [addOpen, setAddOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<OrganizationMemberDetail | null>(
    null,
  )
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string
    name: string
    email: string
  } | null>(null)
  const [keyword, setKeyword] = useState(initialKeyword)

  const refresh = () => router.refresh()

  const onSearch = useDebouncedCallback((value: string) => {
    const params = new URLSearchParams(window.location.search)
    if (value) {
      params.set("keyword", value)
    } else {
      params.delete("keyword")
    }
    router.replace(`${window.location.pathname}?${params.toString()}`)
  }, 300)

  const handleEdit = async (userId: string) => {
    const detail = await getOrganizationMemberDetail({ userId })
    if (detail) {
      setEditTarget(detail)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Button onClick={() => setAddOpen(true)} size="sm">
          <PlusIcon className="size-4" />
          {t("organizationUsers.addButton")}
        </Button>
        <div className="relative w-72">
          <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-secondary" />
          <Input
            className="pl-9"
            defaultValue={initialKeyword}
            onChange={(e) => {
              setKeyword(e.target.value)
              onSearch(e.target.value)
            }}
            placeholder={t("organizationUsers.searchPlaceholder")}
            value={keyword}
          />
        </div>
      </div>

      <div className="divide-y divide-white/[0.06] rounded-md border border-white/[0.06]">
        {members.length === 0 ? (
          <div className="p-6 text-center text-sm text-text-secondary">
            {t("organizationUsers.empty")}
          </div>
        ) : (
          members.map((m) => (
            <MemberRow
              currentUserId={currentUserId}
              key={m.id}
              member={m}
              onDelete={() =>
                setDeleteTarget({
                  id: m.userId,
                  name: m.user.name ?? m.user.email,
                  email: m.user.email,
                })
              }
              onEdit={() => handleEdit(m.userId)}
            />
          ))
        )}
      </div>

      <UserFormDialog
        initial={null}
        onOpenChange={setAddOpen}
        onSuccess={refresh}
        open={addOpen}
        workspaceOptions={workspaceOptions}
      />
      <UserFormDialog
        initial={editTarget}
        onOpenChange={(open) => {
          if (!open) {
            setEditTarget(null)
          }
        }}
        onSuccess={refresh}
        open={Boolean(editTarget)}
        workspaceOptions={workspaceOptions}
      />
      <DeleteUserDialog
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null)
          }
        }}
        onSuccess={refresh}
        open={Boolean(deleteTarget)}
        user={deleteTarget}
      />
    </div>
  )
}

function MemberRow({
  member,
  onEdit,
  onDelete,
  currentUserId,
}: {
  member: ListOrganizationMembersResponse["data"][number]
  onEdit: () => void
  onDelete: () => void
  currentUserId: string
}) {
  const t = useTranslations()
  const isCurrentUser = member.userId === currentUserId
  const initials = (member.user.name || member.user.email)
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <Avatar className="size-10">
        <AvatarImage
          alt={member.user.name ?? member.user.email}
          src={member.user.image ?? ""}
        />
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold text-sm">
          {member.user.name || member.user.email}
        </div>
        <div className="truncate text-text-secondary text-xs">
          {t(`organizationUsers.orgRoles.${member.role}`)} — {member.user.email}
        </div>
      </div>
      <div className="text-text-secondary text-xs">
        {formatLastActive(member.lastActiveAt)}
      </div>
      <div className="flex items-center gap-2">
        {isCurrentUser ? null : (
          <Button onClick={onDelete} size="sm" type="button" variant="ghost">
            <Trash2Icon className="size-4 text-destructive" />
            {t("organizationUsers.delete")}
          </Button>
        )}
        <Button onClick={onEdit} size="sm" type="button" variant="outline">
          {t("organizationUsers.edit")}
        </Button>
      </div>
    </div>
  )
}

function formatLastActive(date: Date | null): string {
  if (!date) {
    return ""
  }
  if (isToday(date)) {
    return format(date, "p", { locale: ptBR })
  }
  if (isYesterday(date)) {
    return "Ontem"
  }
  return format(date, "d MMM", { locale: ptBR })
}
