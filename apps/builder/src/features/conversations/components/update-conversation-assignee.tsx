"use client"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { UserIcon, UsersRoundIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useMemo, useState } from "react"
import { RespondIcon } from "@/components/respond-icon"
import { authClient } from "@/lib/auth/auth-client"
import { getAvatarInitials, getRespondAvatarUrl } from "../../contacts/utils"
import { useContactAssigneeOptions } from "../../users/provider/user-hook"
import type { ListConversationItemResource } from "../schema/resource"
import { AssignConversationPopover } from "./assign-conversation-popover"

type UpdateConversationAssigneeProps = {
  conversation: ListConversationItemResource
  onChange: (user: string | null) => void
}

// Botão do topbar da conversa que mostra o agente atribuído + abre dialog
// pra atribuir/reatribuir. Pixel-perfect Respond.io 2026-05-25:
//   [AVATAR PEQUENO] NOME ⌄
//
// - Atribuído a USER  → avatar real (image OU iniciais coloridas por hash do nome)
// - Atribuído a TEAM  → ícone UsersRound em círculo neutro
// - NÃO atribuído     → avatar vermelho/bordô com silhueta humana (igual mini
//                       avatar do ConversationItem)
export function UpdateConversationAssignee({
  conversation,
  onChange,
}: UpdateConversationAssigneeProps) {
  const t = useTranslations()
  const options = useContactAssigneeOptions({ autoGroup: false })

  const { data: session } = authClient.useSession()
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const onSelectAssignee = useCallback(
    (value: string | null) => {
      setSelectedId(value)
      onChange(value)
    },
    [onChange],
  )

  // Resolve o "estado" pra renderização: tipo + label + avatar.
  // Prioriza dados do `conversation` (que já vêm com assignedUser populated
  // do listConversations) e cai pra `options` se faltar.
  const resolved = useMemo(() => {
    // Atribuído a USER
    if (conversation.assignedUserId) {
      const user = conversation.assignedUser
      const isMe = conversation.assignedUserId === session?.user.id
      const fromOptions = options.find(
        (o) => o.value === `u_${conversation.assignedUserId}`,
      )?.label
      const userName: string = user?.name || user?.email || fromOptions || ""
      const displayName: string = isMe
        ? t("assignAdmin.assignedToMe")
        : userName || t("assignAdmin.assignedToMe")
      // Iter 41: seed = user.id pra consistência.
      // String(...) defensivo: assignedUserId é bigintAsString customType,
      // drizzle-zod infere como {} sem override explícito.
      const seed: string = String(conversation.assignedUserId ?? userName)
      const avatarSpec = getRespondAvatarUrl(seed)
      return {
        kind: "user" as const,
        label: displayName,
        image: user?.image ?? null,
        initials: getAvatarInitials(userName || "?") || "?",
        color: avatarSpec.color,
        seedUrl: avatarSpec.url,
      }
    }
    // Atribuído a TEAM
    if (conversation.assignedInboxTeamId) {
      const teamName =
        conversation.assignedInboxTeam?.name ||
        options.find((o) => o.value === `t_${conversation.assignedInboxTeamId}`)
          ?.label ||
        "Team"
      return { kind: "team" as const, label: teamName }
    }
    // Não atribuído
    return { kind: "unassigned" as const, label: t("assignAdmin.unAssigned") }
  }, [conversation, options, session, t])

  useEffect(() => {
    if (conversation.assignedUserId) {
      setSelectedId(`u_${conversation.assignedUserId}`)
    } else if (conversation.assignedInboxTeamId) {
      setSelectedId(`t_${conversation.assignedInboxTeamId}`)
    } else {
      setSelectedId(null)
    }
  }, [conversation.assignedUserId, conversation.assignedInboxTeamId])

  return (
    <AssignConversationPopover
      assignedId={selectedId ?? undefined}
      contactIds={[conversation.contactId]}
      onSuccess={onSelectAssignee}
      showRemove={true}
      trigger={
        <button
          className="flex h-7 max-w-[200px] items-center gap-1.5 rounded-md px-2 text-[14px] text-text-secondary transition-colors hover:bg-white/[0.06] hover:text-foreground"
          type="button"
        >
          {resolved.kind === "user" && (
            <Avatar className="size-5 shrink-0">
              {/* Iter 42 (Pedro): src de fallback = respond-avatar gerado
                  do user.id. Antes "" → caía pra iniciais "P1". */}
              <AvatarImage
                alt={resolved.label}
                className="object-cover"
                src={resolved.image || resolved.seedUrl}
              />
              <AvatarFallback
                className="font-semibold text-[9px] text-white"
                style={{ backgroundColor: resolved.color }}
              >
                {resolved.initials}
              </AvatarFallback>
            </Avatar>
          )}
          {resolved.kind === "team" && (
            <div className="grid size-5 shrink-0 place-items-center overflow-hidden rounded-full border border-zinc-600 bg-secondary text-text-secondary">
              <UsersRoundIcon size={11} strokeWidth={1.75} />
            </div>
          )}
          {resolved.kind === "unassigned" && (
            <div
              className="grid size-5 shrink-0 place-items-center rounded-full text-white"
              style={{ backgroundColor: "#A63D40" }}
            >
              <UserIcon size={11} strokeWidth={2.25} />
            </div>
          )}
          <span className="cursor-pointer truncate">{resolved.label}</span>
          <RespondIcon name="arrow-down-1" size="xs" />
        </button>
      }
    />
  )
}
