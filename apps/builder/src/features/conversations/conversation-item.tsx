"use client"

import type { LifecycleStageModel } from "@chatbotx.io/database/types"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { format, isToday, isYesterday } from "date-fns"
import {
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  UserIcon,
  UsersRoundIcon,
} from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useMemo } from "react"
import { toast } from "sonner"
import { RespondIcon } from "@/components/respond-icon"
import { useChatStore } from "../chat/store/chat-store-provider"
import {
  getAvatarInitials,
  getRespondAvatarUrl,
  useAvatarUrl,
} from "../contacts/utils"
import { LifecycleStagePill } from "../lifecycle-stages/lifecycle-stage-pill"
import { readConversationAction } from "./actions/read-conversation.action"
import type { ListConversationItemResource } from "./schema/resource"

type ConversationItemProps = {
  conversation: ListConversationItemResource
  lifecycleStages?: LifecycleStageModel[]
  onSelect: () => void
}

// Mini-avatar 16 px do atendente atribuído (canto direito da linha 3 do
// card). Pixel-perfect Respond.io (doc inbox/assigning-and-closing-a-conversation.md
// + imagem ae86d99a8a8cedde.jpg):
//
// - Atribuído a USER  → avatar com foto (user.image) OU fallback colorido
//   com iniciais (cor consistente via getRespondAvatarUrl-hash do nome)
// - Atribuído a TEAM  → círculo neutro com ícone UsersRound
// - NÃO atribuído     → círculo VERMELHO/BORDÔ com silhueta humana branca
//   (Pedro pediu explicitamente 2026-05-25 — fica visível em todos os
//   cards sem agente, sinal claro de "ninguém pegou ainda")
function AssignedAvatar({
  conversation,
  unassignedLabel,
}: {
  conversation: ListConversationItemResource
  unassignedLabel: string
}) {
  // 1. Atribuído a um agente
  if (conversation.assignedUserId && conversation.assignedUser) {
    const user = conversation.assignedUser
    const displayName = user.name || user.email || ""
    // Iter 41: seed = user.id (consistente em todos os lugares).
    const avatarSpec = getRespondAvatarUrl(user.id ?? displayName)
    const initials = getAvatarInitials(displayName) || "?"
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Avatar className="size-5 shrink-0">
            {/* Iter 42 (Pedro): src de fallback = respond-avatar gerado
                pelo id. Antes ficava "" quando user.image=null → caía
                pra iniciais. Agora mesmo sem user.image mostra avatar
                consistente com o resto do app. */}
            <AvatarImage
              alt={displayName}
              className="object-cover"
              src={user.image || avatarSpec.url}
            />
            <AvatarFallback
              className="font-semibold text-[10px] text-white"
              style={{ backgroundColor: avatarSpec.color }}
            >
              {initials}
            </AvatarFallback>
          </Avatar>
        </TooltipTrigger>
        <TooltipContent align="center" side="bottom">
          {displayName || "User"}
        </TooltipContent>
      </Tooltip>
    )
  }

  // 2. Atribuído a uma equipe
  if (conversation.assignedInboxTeamId) {
    const teamName = conversation.assignedInboxTeam?.name || "Team"
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="grid size-5 shrink-0 place-items-center overflow-hidden rounded-full border border-zinc-600 bg-secondary text-text-secondary">
            <UsersRoundIcon size={12} strokeWidth={1.75} />
          </div>
        </TooltipTrigger>
        <TooltipContent align="center" side="bottom">
          {teamName}
        </TooltipContent>
      </Tooltip>
    )
  }

  // 3. Não atribuído → placeholder vermelho/bordô
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className="grid size-5 shrink-0 place-items-center rounded-full text-white"
          style={{ backgroundColor: "#A63D40" }}
        >
          <UserIcon size={12} strokeWidth={2.25} />
        </div>
      </TooltipTrigger>
      <TooltipContent align="center" side="bottom">
        {unassignedLabel}
      </TooltipContent>
    </Tooltip>
  )
}

// Formato pixel-perfect Respond.io: "7:19 PM" se hoje (12h com AM/PM —
// validado no Respond ao vivo 2026-05-24, Pedro pediu igual), "Ontem" se
// ontem, dia da semana se semana, "dd/MM/yy" antigo. Cor #97A0AA (12/16).
function formatConversationTimestamp(
  date: Date | string,
  _todayLabel: string,
  yesterdayLabel: string,
): string {
  const d = typeof date === "string" ? new Date(date) : date
  if (isToday(d)) {
    return format(d, "h:mm a")
  }
  if (isYesterday(d)) {
    return yesterdayLabel
  }
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  if (d > sevenDaysAgo) {
    return format(d, "EEE")
  }
  return format(d, "dd/MM/yy")
}

export default function ConversationItem({
  conversation,
  lifecycleStages = [],
  onSelect,
}: ConversationItemProps) {
  const t = useTranslations()
  const lastMessage = conversation.messages?.[0]
  const { activeConversationId, readConversation } = useChatStore(
    (state) => state,
  )
  const isActive = conversation.id === activeConversationId
  const avatarUrl = useAvatarUrl(conversation.contact)

  // Lookup local do stage do contato (lifecycleStages vem do layout via
  // ChatLayout → ConversationList → ConversationItem). Evita N+1 fetch.
  // Pixel-perfect Respond.io: pill aparece na linha 3 do card.
  const lifecycleStage = useMemo(() => {
    const contactStageId = conversation.contact?.lifecycleStageId
    if (!contactStageId) {
      return null
    }
    return lifecycleStages.find((s) => s.id === contactStageId) ?? null
  }, [conversation.contact?.lifecycleStageId, lifecycleStages])

  // Avatar 32x32 pixel-perfect Respond.io. Se contato tem avatar próprio,
  // usa; senão cai no avatar real do Respond (pasta /public/respond-avatars).
  // Cor + expressão determinada por hash do nome — mesmo contato sempre o
  // mesmo avatar. Logo do canal WhatsApp REMOVIDO (Pedro pediu 2026-05-24).
  const fullName = conversation.contact?.fullName ?? ""
  // Iter 41 (Pedro): seed = ID do contato (snowflake imutável).
  // Antes era `fullName || id` — risco de mudar cor se renomear contato.
  // Garante consistência em TODOS os lugares que renderizam esse avatar.
  const respondAvatar = getRespondAvatarUrl(
    conversation.contact?.id ?? fullName,
  )
  const finalAvatarUrl = avatarUrl || respondAvatar.url
  const initials = getAvatarInitials(fullName)
  const contactAvatar = useMemo(
    () => (
      <Avatar className="size-8 shrink-0">
        <AvatarImage
          alt={fullName}
          className="object-cover"
          src={finalAvatarUrl}
        />
        <AvatarFallback
          className="font-medium text-[13px] text-white"
          style={{ backgroundColor: respondAvatar.color }}
        >
          {initials}
        </AvatarFallback>
      </Avatar>
    ),
    [fullName, finalAvatarUrl, respondAvatar.color, initials],
  )

  const { execute: read } = useAction(
    readConversationAction.bind(
      null,
      conversation.workspaceId,
      conversation.id,
    ),
    {
      onSuccess: () => {
        readConversation(conversation.id)
      },
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: execute is not a dependency
  useEffect(() => {
    if (isActive) {
      read()
    }
  }, [isActive])

  // -------- Indicadores visuais --------

  // Não-lida: tem mensagem incoming nova após última leitura do agente.
  // unreadCount vem do backend (subquery em listConversations). hasUnread
  // = unreadCount > 0 — assim quando agente clica e marca como lida
  // (agentLastReadAt = NOW), unreadCount vai pra 0 e pill some imediato.
  // Não usar contactLastReadAt aqui — esse pode estar setado mas agente
  // já leu, daria pill vazio com "0".
  const hasUnread = conversation.unreadCount > 0

  // Seta direção: outgoing (agente/bot) = ↗ azul, incoming (contato) = ↙
  // laranja. Mostra origem da última mensagem (igual Respond.io).
  const lastIsOutgoing = lastMessage?.messageType === "outgoing"
  const lastIsIncoming = lastMessage?.messageType === "incoming"

  const isClosed = Boolean(conversation.archivedAt)
  const isBlocked = Boolean(conversation.contact?.blockedAt)

  const timestamp = formatConversationTimestamp(
    lastMessage?.createdAt
      ? lastMessage.createdAt
      : (conversation.lastActivityAt ?? new Date()),
    t("conversations.todayLabel"),
    t("conversations.yesterdayLabel"),
  )

  return (
    // border-bottom sutil entre cards (rgba(255,255,255,.06) = white/[0.06]
    // do Tailwind). Igual Respond.io ao vivo — separa cada card sem ficar
    // pesado visualmente. Decisão Pedro 2026-05-24.
    <div className="group relative w-full border-white/[0.06] border-b">
      <Button
        className={cn(
          // Card compacto Respond.io (Pedro 2026-05-26): altura reduzida
          // de 98 → 76 px (12 top → 8 top, 14 bottom → 8 bottom, mt-1
          // entre linha 2 e 3 → mt-0.5). Confirmado no Respond.io ao vivo
          // que cards são mais apertados — antes ficava "soltinho" com
          // muito espaço vertical em volta do conteúdo.
          "flex h-auto min-h-[84px] w-full items-start gap-3 rounded-none border-0 px-3 py-2.5 text-left font-normal hover:bg-white/[0.03]",
          isActive && "bg-white/[0.06] hover:bg-white/[0.06]",
        )}
        onClick={() => onSelect()}
        type="button"
        variant="ghost"
      >
        <div className="relative shrink-0">
          {contactAvatar}
          {/* Mini-avatar do atendente migrou pra LINHA 3 inline (pixel-perfect
              Respond.io § 5 do _visual-respond-mapping.md). Antes ficava
              overlay no avatar do contato. */}
          {/* Logo do canal (WhatsApp etc) REMOVIDO — Pedro pediu 2026-05-24 */}
          {conversation.followed && (
            <div className="absolute top-0 right-0">
              <RespondIcon
                className="text-yellow-400"
                name="star-bold"
                size="xs"
              />
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Linha 1: nome (14/22 weight 600) + timestamp HH:mm à direita */}
          <div className="flex items-center justify-between gap-2">
            <div
              className={cn(
                "min-w-0 truncate text-left font-semibold text-[14px] leading-[22px]",
                hasUnread ? "text-foreground" : "text-text-secondary",
              )}
            >
              {conversation.contact?.fullName}
            </div>
            <span
              className={cn(
                "shrink-0 text-[12px] leading-[16px]",
                // Quando unread, hora branca (Pedro pediu 2026-05-24).
                // Quando lida, cinza muted.
                hasUnread ? "font-semibold text-foreground" : "text-[#97A0AA]",
              )}
            >
              {timestamp}
            </span>
          </div>

          {/* Linha 2: seta direção + snippet + badge não-lida */}
          <div className="mt-0.5 flex items-center gap-1.5">
            {/* Setas Lucide (eram OK antes). Pedro pediu pra NÃO trocar
                quando trocou tudo pra iconfont 2026-05-24. */}
            {lastIsOutgoing && (
              <ArrowUpRightIcon className="size-3.5 shrink-0 text-primary" />
            )}
            {lastIsIncoming && (
              <ArrowDownLeftIcon className="size-3.5 shrink-0 text-orange-400" />
            )}
            <div
              className={cn(
                "min-w-0 flex-1 truncate text-left text-[14px] leading-[20px]",
                hasUnread
                  ? "font-medium text-foreground"
                  : "text-muted-foreground",
              )}
            >
              {lastMessage?.text ?? " "}
            </div>
            {conversation.unreadCount > 0 && (
              // Pill azul com NÚMERO de mensagens incoming não lidas.
              // SÓ renderiza quando count > 0 — quando agente clica e
              // marca como lida, pill some por completo (não fica "0"
              // vazio dentro).
              <span className="inline-grid h-5 min-w-[20px] shrink-0 place-items-center rounded-[10px] bg-primary px-1.5 font-bold text-[12px] text-primary-foreground leading-none">
                {conversation.unreadCount > 99
                  ? "99+"
                  : conversation.unreadCount}
              </span>
            )}
          </div>

          {/* Linha 3: StagePill (opcional) + mini-avatar atendente (UNIVERSAL).
              Pixel-perfect Respond.io § 5 do _visual-respond-mapping.md.
              Mini-avatar SEMPRE aparece — quando não atribuído, mostra
              placeholder vermelho com silhueta humana (sinal visual claro
              de "ninguém pegou ainda"). Pedro pediu 2026-05-25. */}
          <div className="mt-1 flex h-5 items-center gap-2">
            <LifecycleStagePill stage={lifecycleStage} />
            <div className="ml-auto">
              <AssignedAvatar
                conversation={conversation}
                unassignedLabel={t("conversations.unassignedAgent")}
              />
            </div>
          </div>

          {/* Linha 4 (opcional): rótulo de status — Fechada ou Bloqueada */}
          {(isClosed || isBlocked) && (
            <div className="mt-1 flex items-center gap-2 text-[10px] uppercase tracking-wide">
              {isClosed && (
                <span className="rounded-sm bg-secondary px-1.5 py-0.5 text-muted-foreground">
                  {t("states.closed")}
                </span>
              )}
              {isBlocked && (
                <span className="rounded-sm bg-destructive/15 px-1.5 py-0.5 text-destructive">
                  {t("states.blocked")}
                </span>
              )}
            </div>
          )}
        </div>
      </Button>
      {/* Hover actions REMOVIDOS — Pedro pediu 2026-05-24. Fechar/reabrir
          fica só pelo botão primário do header da conversa. */}
    </div>
  )
}
