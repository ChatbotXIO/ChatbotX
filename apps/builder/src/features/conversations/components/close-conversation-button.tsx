"use client"

import type { ClosingNotesMode } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Loader2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useState } from "react"
import { toast } from "sonner"
import { RespondIcon } from "@/components/respond-icon"
import type { ClosingNoteCategoryOption } from "@/features/closing-notes/queries/get-config"
import { useWorkspaceId } from "@/hooks/routing"
import { useChatStore } from "../../chat/store/chat-store-provider"
import { archiveConversationAction } from "../actions/archive-conversation.action"
import { unarchiveConversationAction } from "../actions/unarchive-conversation.action"
import type { ListConversationItemResource } from "../schema/resource"
import { CloseConversationDialog } from "./close-conversation-dialog"

type CloseConversationButtonProps = {
  conversation: ListConversationItemResource
  closingNotesMode?: ClosingNotesMode
  closingNoteCategories?: ClosingNoteCategoryOption[]
}

// Botão primário "Fechar"/"Reabrir" no canto direito do header da conversa,
// igual Respond.io. Modo "disabled" mantém comportamento legado (1 clique
// arquiva). Demais modos abrem CloseConversationDialog (pede categoria +
// summary conforme política do workspace — #15 Fase C 2026-05-27).
export function CloseConversationButton({
  conversation,
  closingNotesMode = "disabled",
  closingNoteCategories = [],
}: CloseConversationButtonProps) {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const { resetState, loadMoreConversations } = useChatStore((state) => state)
  const [dialogOpen, setDialogOpen] = useState(false)

  const reload = () => {
    resetState()
    loadMoreConversations(workspaceId)
  }

  const { execute: archive, isExecuting: isArchiving } = useAction(
    archiveConversationAction.bind(null, workspaceId),
    {
      onSuccess: reload,
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  const { execute: unarchive, isExecuting: isUnarchiving } = useAction(
    unarchiveConversationAction.bind(null, workspaceId),
    {
      onSuccess: reload,
      onError: ({ error }) => {
        if (error.serverError) {
          toast.error(error.serverError)
        }
      },
    },
  )

  // Contato bloqueado não pode reabrir nem fechar (Respond.io desabilita).
  const isBlocked = Boolean(conversation.contact?.blockedAt)
  const isClosed = Boolean(conversation.archivedAt)
  const isPending = isArchiving || isUnarchiving

  // Pixel-perfect Respond.io 2026-05-25 — botão FECHAR/ABRIR é DISCRETO:
  // bg transparente · border sutil rgba(182,188,195,0.16) · text #CFD3D8
  // (text-secondary) · NÃO é verde sólido como antes. Validado via
  // getComputedStyle no Respond.io ao vivo.
  const sharedClasses =
    "!h-7 shrink-0 gap-1.5 rounded-md border border-white/[0.16] bg-transparent px-3 font-semibold text-[12px] text-text-secondary uppercase tracking-wide transition-colors hover:bg-white/[0.06] hover:text-foreground"

  if (isClosed) {
    return (
      <Button
        aria-label={t("actions.openConversation")}
        className={sharedClasses}
        disabled={isPending || isBlocked}
        onClick={() => unarchive({ ids: [conversation.id] })}
        size="sm"
        title={t("actions.openConversation")}
        variant="outline"
      >
        {isUnarchiving ? (
          <Loader2Icon className="animate-spin" />
        ) : (
          <RespondIcon name="refresh" size="sm" />
        )}
        <span className="@[680px]/topbar:inline hidden">
          {t("actions.openConversation")}
        </span>
      </Button>
    )
  }

  const handleClick = () => {
    if (closingNotesMode === "disabled") {
      archive({ ids: [conversation.id] })
      return
    }
    setDialogOpen(true)
  }

  return (
    <>
      <Button
        aria-label={t("actions.closeConversation")}
        className={sharedClasses}
        disabled={isPending || isBlocked}
        onClick={handleClick}
        size="sm"
        title={t("actions.closeConversation")}
        variant="outline"
      >
        {isArchiving ? (
          <Loader2Icon className="animate-spin" />
        ) : (
          <RespondIcon name="tick-circle" size="sm" />
        )}
        <span className="@[680px]/topbar:inline hidden">
          {t("actions.closeConversation")}
        </span>
      </Button>

      {closingNotesMode !== "disabled" && (
        <CloseConversationDialog
          categories={closingNoteCategories}
          conversationId={conversation.id}
          mode={closingNotesMode}
          onOpenChange={setDialogOpen}
          onSuccess={reload}
          open={dialogOpen}
          workspaceId={workspaceId}
        />
      )}
    </>
  )
}
