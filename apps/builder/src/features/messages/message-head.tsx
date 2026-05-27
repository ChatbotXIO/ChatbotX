"use client"

import type { ClosingNotesMode } from "@chatbotx.io/database/partials"
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
import { useTranslations } from "next-intl"
import { useState } from "react"
import { RespondIcon } from "@/components/respond-icon"
import type { ClosingNoteCategoryOption } from "@/features/closing-notes/queries/get-config"
import { useChatStore } from "../chat/store/chat-store-provider"
import {
  getAvatarInitials,
  getRespondAvatarUrl,
  useAvatarUrl,
} from "../contacts/utils"
import { CloseConversationButton } from "../conversations/components/close-conversation-button"
import { ConversationSearchBar } from "../conversations/components/conversation-search-bar"
import { UpdateConversationAssignee } from "../conversations/components/update-conversation-assignee"
import { ConversationAction } from "../conversations/conversation-action"
import { ShortcutMenu } from "../flows/shortcut-menu"
import { LifecycleBadgeSelect } from "../lifecycle-stages/lifecycle-badge-select"
import { LifecycleNextStageButton } from "../lifecycle-stages/lifecycle-next-stage-button"

// Pixel-perfect Respond.io 2026-05-24 — ordem do header da conversa:
//   [esquerda: Nome + Lifecycle Badge + chevron →]
//   [direita:  Atribuição "Fernanda ↓"  Lupa  Atalhos⚡  FECHAR(verde)  ...]
// Atribuição saiu de SUB-LINHA do nome (era "Atribuir conversa ↓") e virou
// botão inline no topo direito, exatamente como Respond.io.
export default function MessageHead({
  lifecycleStages = [],
  closingNotesMode = "disabled",
  closingNoteCategories = [],
}: {
  lifecycleStages?: LifecycleStageModel[]
  closingNotesMode?: ClosingNotesMode
  closingNoteCategories?: ClosingNoteCategoryOption[]
}) {
  const t = useTranslations()

  const { conversations, activeConversationId, setAssignee } = useChatStore(
    (state) => state,
  )

  const activeConversation = conversations.find(
    (c) => c.id === activeConversationId,
  )

  const [searchOpen, setSearchOpen] = useState(false)

  // IMPORTANTE: hook chamado ANTES do early return pra não violar React rules.
  const avatarUrl = useAvatarUrl(activeConversation?.contact)

  if (!activeConversation) {
    return null
  }

  const contact = activeConversation.contact as
    | {
        id?: string
        lifecycleStageId?: string | null
        fullName?: string | null
        avatar?: string | null
      }
    | null
    | undefined
  const contactLifecycleId = contact?.lifecycleStageId ?? null
  const contactId = contact?.id ?? null
  const fullName =
    contact?.fullName ?? activeConversation.contact?.fullName ?? ""

  // Avatar pequeno do contato no topbar.
  // Iter 41: seed = ID do contato (consistente com conv-list + drawer + bubble).
  const respondAvatar = getRespondAvatarUrl(contactId ?? fullName)
  const initials = getAvatarInitials(fullName)

  return (
    <div className="@container/topbar flex flex-col">
      {/* Header pixel-perfect Respond.io 2026-05-25:
            - bg #222225 · padding y 6px x 12px · height 45px
            - border-bottom rgba(182,188,195,0.16)
            - layout: [avatar 32 + nome 16/400 + LIFECYCLE-GROUP (esquerda flex-1)] [botões direita gap-1] */}
      <div className="flex h-[45px] items-center gap-2 border-white/[0.16] border-b bg-card px-3">
        {/* ESQUERDA: Avatar 32 + Nome 16px/normal + grupo lifecycle (badge+chevron colados) */}
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Avatar className="size-8 shrink-0">
            <AvatarImage alt={fullName} src={avatarUrl || respondAvatar.url} />
            <AvatarFallback
              className="font-medium text-[12px] text-white"
              style={{ backgroundColor: respondAvatar.color }}
            >
              {initials}
            </AvatarFallback>
          </Avatar>
          {/* Nome do contato: weight 700 (bold) + 14px — re-medido Respond.io
              iter 39 via Chrome MCP. Antes era 600/16px. Confirmado:
              `Juracy Rodrigues Barbosa` size=14px weight=700 color=#CFD3D8. */}
          <div className="truncate font-bold text-[14px] text-text-secondary leading-[22px]">
            {fullName}
          </div>
          {contactId && (
            // Grupo "pílula" — badge + chevron colados (gap-0) com BORDER
            // único em volta dos dois e radius no wrapper (children sem
            // radius próprio). Pixel-perfect Respond.io 2026-05-25 (Pedro
            // pediu contorno + altura uniforme h-7).
            <div className="ml-1 flex h-7 items-center gap-0 overflow-hidden rounded-md border border-white/[0.16]">
              <LifecycleBadgeSelect
                contactId={contactId}
                currentStageId={contactLifecycleId}
                stages={lifecycleStages}
              />
              <LifecycleNextStageButton
                contactId={contactId}
                currentStageId={contactLifecycleId}
                stages={lifecycleStages}
              />
            </div>
          )}
        </div>

        {/* DIREITA: Atribuição + Lupa + Raio + Workflows + (Telefone) + FECHAR + Menu */}
        <div className="flex shrink-0 items-center gap-1">
          <UpdateConversationAssignee
            conversation={activeConversation}
            onChange={setAssignee}
          />

          {/* Botão "Transferir Conversa para o Bot" REMOVIDO 2026-05-25
              (Pedro pediu — Bot continua funcionando mas sem UI no header). */}

          {/* Lupa "buscar nesta conversa" */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                aria-label={t("conversations.searchInConversation")}
                className="size-7 p-1 text-text-secondary hover:bg-white/[0.06] hover:text-foreground"
                onClick={() => setSearchOpen((open) => !open)}
                size="icon"
                variant={searchOpen ? "secondary" : "ghost"}
              >
                <RespondIcon name="search-normal" size="lg" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{t("conversations.searchInConversation")}</p>
            </TooltipContent>
          </Tooltip>

          {/* Atalhos / Shortcut workflows (raio ⚡) — sempre visível
              (Pedro pediu 2026-05-25). Lista fluxos com TriggerNode
              "shortcut"; quando vazio mostra mensagem indicando como criar. */}
          <ShortcutMenu conversationId={activeConversation.id} />

          {/* Botão "Workflows em andamento" (ramificação) REMOVIDO 2026-05-25
              — era placeholder fake sem funcionalidade. Pedro pediu "nenhuma
              ponta solta". */}

          {/* FECHAR/ABRIR (discreto, outline cinza) */}
          <CloseConversationButton
            closingNoteCategories={closingNoteCategories}
            closingNotesMode={closingNotesMode}
            conversation={activeConversation}
          />

          {/* Menu ... (Follow, Não-lido, Bloquear, Excluir) */}
          <ConversationAction conversation={activeConversation} />
        </div>
      </div>
      {searchOpen && (
        <ConversationSearchBar conversationId={activeConversation.id} />
      )}
    </div>
  )
}
