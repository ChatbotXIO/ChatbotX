"use client"

import type { LifecycleStageModel } from "@chatbotx.io/database/types"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
} from "@chatbotx.io/ui/components/ui/select"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useChatStore } from "@/features/chat/store/chat-store-provider"
import { useWorkspaceId } from "@/hooks/routing"
import { updateContactLifecycleAction } from "./actions/update-contact-lifecycle-action"

type LifecycleBadgeSelectProps = {
  contactId: string
  currentStageId: string | null
  stages: LifecycleStageModel[]
  onChange?: (stageId: string | null) => void
}

// Versão "badge" compacta do ContactLifecycleSelect — pra usar no header da
// conversa, igual Respond.io: lifecycle aparece como pill clicável ao lado do
// nome, click abre dropdown com os stages. Quando não tem stage definido,
// mostra "Sem estágio" em outline.
// 2026-05-24 — Sprint Inbox 1.1.
export function LifecycleBadgeSelect({
  contactId,
  currentStageId,
  stages,
  onChange,
}: LifecycleBadgeSelectProps) {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const updateContactInConversations = useChatStore(
    (state) => state.updateContactInConversations,
  )
  const [optimisticStageId, setOptimisticStageId] = useState<string | null>(
    currentStageId,
  )

  // Sincroniza estado local com prop quando ela muda externamente (ex.:
  // user clicou no botão de próxima etapa, navegou pra outra conversa,
  // ou outro componente atualizou o lifecycle). Pedro pediu 2026-05-25 —
  // "tudo instantâneo, trocou em um canto vai trocar em todos os outros".
  useEffect(() => {
    setOptimisticStageId(currentStageId)
  }, [currentStageId])

  const activeStages = stages.filter((s) => !s.isLost)
  const lostStages = stages.filter((s) => s.isLost)
  const current = optimisticStageId
    ? stages.find((s) => s.id === optimisticStageId)
    : null

  const { execute, isExecuting } = useAction(
    updateContactLifecycleAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        toast.success(t("lifecycle.contactUpdated"))
      },
      onError: ({ error }) => {
        setOptimisticStageId(currentStageId)
        // Reverte também no store global
        updateContactInConversations(contactId, {
          lifecycleStageId: currentStageId,
        })
        toast.error(error.serverError ?? t("lifecycle.contactUpdateError"))
      },
    },
  )

  function handleChange(value: string) {
    const next = value === "__none__" ? null : value
    setOptimisticStageId(next)
    // Propaga MUDANÇA pra TODAS as conversations do contato no store
    // global → card da lista, header da conversa, drawer direito todos
    // re-renderizam instantaneamente sem precisar refresh.
    updateContactInConversations(contactId, { lifecycleStageId: next })
    onChange?.(next)
    execute({ contactId, lifecycleStageId: next })
  }

  // Sem stages cadastrados no workspace: não renderiza (igual quando lifecycle
  // tá desabilitado).
  if (stages.length === 0) {
    return null
  }

  return (
    <Select
      disabled={isExecuting}
      onValueChange={handleChange}
      value={optimisticStageId ?? "__none__"}
    >
      {/* Pixel-perfect Respond.io 2026-05-25:
            bg transparente · color #CFD3D8 · font 14/400 · padding 0 14 0 8
            radius só lado esquerdo (forma "pílula" com LifecycleNextStageButton à direita)
            height 28px (h-7) · sem chevron interno · sem uppercase forçado */}
      {/* Pixel-perfect Respond.io 2026-05-25 — forçar bg transparente em
          dark mode (SelectTrigger tem `dark:bg-input/30` default) e forçar
          h-7 sobrescrevendo o `data-[size=default]:h-9` padrão. Sem radius
          nem border próprios — o WRAPPER pai (MessageHead) tem o border e
          radius da pílula inteira. */}
      <SelectTrigger
        aria-label={t("lifecycle.contactLifecycle")}
        className={cn(
          // font-medium (weight 500) — pixel-perfect Respond.io
          // 2026-05-25 iteração 12: "RMKT ENVIADO" tem weight=500 size=14px
          // no header (Chrome MCP). Antes estava como font-normal.
          "!h-7 !bg-transparent hover:!bg-white/[0.06] dark:!bg-transparent dark:hover:!bg-white/[0.06] shrink-0 gap-0 rounded-none border-0 py-0 pr-3.5 pl-2 font-medium text-[14px] text-text-secondary shadow-none transition-colors focus:ring-0 focus:ring-offset-0 [&>svg]:hidden",
          current
            ? "text-text-secondary"
            : "text-muted-foreground hover:text-text-secondary",
        )}
      >
        <span className="truncate leading-none">
          {current ? (
            <>
              {current.icon ? `${current.icon} ` : ""}
              {current.name}
            </>
          ) : (
            t("lifecycle.noStage")
          )}
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">
          <span className="text-muted-foreground">
            {t("lifecycle.noStage")}
          </span>
        </SelectItem>
        {activeStages.length > 0 && (
          <SelectGroup>
            <SelectLabel>{t("lifecycle.activeStages")}</SelectLabel>
            {activeStages.map((stage) => (
              <SelectItem key={stage.id} value={stage.id}>
                <span className="mr-2">{stage.icon ?? "•"}</span>
                {stage.name}
              </SelectItem>
            ))}
          </SelectGroup>
        )}
        {lostStages.length > 0 && (
          <>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>{t("lifecycle.lostStages")}</SelectLabel>
              {lostStages.map((stage) => (
                <SelectItem key={stage.id} value={stage.id}>
                  <span className="mr-2">{stage.icon ?? "•"}</span>
                  {stage.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </>
        )}
      </SelectContent>
    </Select>
  )
}
