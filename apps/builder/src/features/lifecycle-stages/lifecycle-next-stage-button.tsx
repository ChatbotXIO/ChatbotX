"use client"

import type { LifecycleStageModel } from "@chatbotx.io/database/types"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { ChevronRightIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useMemo } from "react"
import { toast } from "sonner"
import { useChatStore } from "@/features/chat/store/chat-store-provider"
import { useWorkspaceId } from "@/hooks/routing"
import { updateContactLifecycleAction } from "./actions/update-contact-lifecycle-action"

type LifecycleNextStageButtonProps = {
  contactId: string
  currentStageId: string | null
  stages: LifecycleStageModel[]
  onChange?: (stageId: string | null) => void
}

// Botão chevron-right ao lado do badge de lifecycle no topbar da conversa.
// Pedro pediu pixel-perfect Respond.io 2026-05-25: clicar avança o contato
// PRA PRÓXIMA ETAPA do funil (próxima stage ATIVA por `position`). Etapas
// "perdidas" (isLost) ficam fora do fluxo automático.
//
// - Sem stage atual → vai pra primeira stage ativa
// - Na última stage ativa → desabilitado
// - Tooltip mostra "Próxima etapa: NOME"
export function LifecycleNextStageButton({
  contactId,
  currentStageId,
  stages,
  onChange,
}: LifecycleNextStageButtonProps) {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const updateContactInConversations = useChatStore(
    (state) => state.updateContactInConversations,
  )

  // Stages ativas (isLost = false) ordenadas por position. Lost ficam de
  // fora — não fazem parte do funil principal.
  const activeStages = useMemo(
    () =>
      stages
        .filter((s) => !s.isLost && s.isActive)
        .sort((a, b) => a.position - b.position),
    [stages],
  )

  const nextStage = useMemo(() => {
    if (activeStages.length === 0) {
      return null
    }
    if (!currentStageId) {
      return activeStages[0]
    }
    const currentIdx = activeStages.findIndex((s) => s.id === currentStageId)
    // Stage atual não está nas ativas (ex.: é uma lost) → próxima = primeira
    if (currentIdx === -1) {
      return activeStages[0]
    }
    // Já é a última — não há próxima (botão fica DISABLED, não escondido)
    if (currentIdx === activeStages.length - 1) {
      return null
    }
    return activeStages[currentIdx + 1]
  }, [activeStages, currentStageId])

  const { execute, isExecuting } = useAction(
    updateContactLifecycleAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        toast.success(t("lifecycle.contactUpdated"))
      },
      onError: ({ error }) => {
        toast.error(error.serverError ?? t("lifecycle.contactUpdateError"))
      },
    },
  )

  // Sem stages cadastrados no workspace → some por completo (não há funil).
  if (stages.length === 0) {
    return null
  }

  // Botão SEMPRE renderiza quando há funil. Quando contato já está na
  // ÚLTIMA etapa (`!nextStage`), fica DISABLED com tooltip indicando que
  // não há próxima — Pedro pediu 2026-05-25, igual Respond.io.
  const isAtLastStage = !nextStage
  const tooltipLabel = isAtLastStage
    ? t("lifecycle.lastStageTooltip")
    : t("lifecycle.nextStageTooltip", {
        name: `${nextStage.icon ?? ""} ${nextStage.name}`.trim(),
      })

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* Pixel-perfect Respond.io 2026-05-25:
              w 35 · h 28 · padding 0 8 · radius right-only
              color #CFD3D8 (text-secondary) · bg transparent
              Forma "pílula" colada ao LifecycleBadgeSelect (gap-0 entre eles). */}
        {/* Sem radius/border próprios — wrapper pai tem a borda da pílula
            inteira. Forçar h-7 com !important (Button shadcn tem default h-9).
            Disabled quando já está na ÚLTIMA etapa (não esconde — mantém
            visível pra UX consistente, igual Respond.io). */}
        <Button
          aria-label={tooltipLabel}
          className="!h-7 shrink-0 rounded-none border-0 bg-transparent px-2 text-text-secondary transition-colors hover:bg-white/[0.06] hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-text-secondary"
          disabled={isExecuting || isAtLastStage}
          onClick={() => {
            if (!nextStage) {
              return
            }
            // Propaga mudança INSTANTÂNEA pra todas as conversations do
            // contato no store global → card + header + drawer atualizam
            // sem refresh. Pedro pediu 2026-05-25.
            updateContactInConversations(contactId, {
              lifecycleStageId: nextStage.id,
            })
            onChange?.(nextStage.id)
            execute({ contactId, lifecycleStageId: nextStage.id })
          }}
          size="icon"
          type="button"
          variant="ghost"
        >
          <ChevronRightIcon className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p>{tooltipLabel}</p>
      </TooltipContent>
    </Tooltip>
  )
}
