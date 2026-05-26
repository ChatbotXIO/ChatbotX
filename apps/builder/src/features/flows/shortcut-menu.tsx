"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { Flash } from "iconsax-reactjs"
import { type IconsaxComponent, wrapIconsax } from "@/components/iconsax-icon"

const ZapIcon = wrapIconsax(Flash as IconsaxComponent, "Bold")

import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { useWorkspaceId } from "@/hooks/routing"
import { triggerShortcutAction } from "./actions/trigger-shortcut-action"
import {
  listShortcutFlows,
  type ShortcutFlow,
} from "./queries/list-shortcut-flows"

type ShortcutMenuProps = {
  conversationId: string
}

/**
 * Botão "⚡ Atalhos" no header da conversa do Inbox.
 * Lista flows ativos com TriggerNode tipo "shortcut" e dispara o que o
 * atendente clicar (estilo Respond.io).
 *
 * Esconde o botão inteiro se não houver shortcut configurado no workspace.
 */
export function ShortcutMenu({ conversationId }: ShortcutMenuProps) {
  const t = useTranslations()
  const workspaceId = useWorkspaceId()
  const [shortcuts, setShortcuts] = useState<ShortcutFlow[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

  // Refetch sempre que o menu abrir — atalhos podem ter sido adicionados no
  // flow builder em outra aba.
  useEffect(() => {
    if (!open) {
      return
    }
    let cancelled = false
    setLoading(true)
    listShortcutFlows(workspaceId)
      .then((data) => {
        if (!cancelled) {
          setShortcuts(data)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [open, workspaceId])

  // 1ª carga (pra decidir se mostra o botão ou esconde).
  useEffect(() => {
    let cancelled = false
    listShortcutFlows(workspaceId)
      .then((data) => {
        if (!cancelled) {
          setShortcuts(data)
          setLoading(false)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [workspaceId])

  const { execute, isExecuting } = useAction(
    triggerShortcutAction.bind(null, workspaceId),
    {
      onSuccess: () => {
        toast.success(t("trigger.shortcutMenu.fired"))
        setOpen(false)
      },
      onError: ({ error }) => {
        toast.error(error.serverError ?? t("trigger.shortcutMenu.fireError"))
      },
    },
  )

  // Pedro pediu 2026-05-25: botão SEMPRE visível pra o usuário saber que
  // existe a feature de atalhos (Workflows com gatilho "shortcut"). Quando
  // não há atalho configurado, mostra mensagem indicando como criar.

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              aria-label={t("trigger.shortcutMenu.button")}
              className="size-7 p-1 text-text-secondary hover:bg-white/[0.06] hover:text-foreground"
              disabled={isExecuting}
              size="icon"
              variant="ghost"
            >
              <ZapIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>{t("trigger.shortcutMenu.button")}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="min-w-[260px]">
        <DropdownMenuLabel>{t("trigger.shortcutMenu.title")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {(() => {
          if (loading) {
            return (
              <div className="px-2 py-2 text-muted-foreground text-xs">
                {t("trigger.shortcutMenu.loading")}
              </div>
            )
          }
          if (shortcuts.length === 0) {
            return (
              <div className="px-2 py-3 text-muted-foreground text-xs leading-relaxed">
                {t("trigger.shortcutMenu.empty")}
              </div>
            )
          }
          return shortcuts.map((s) => (
            <DropdownMenuItem
              disabled={isExecuting}
              key={s.flowId}
              onSelect={() => execute({ conversationId, flowId: s.flowId })}
            >
              <span className="mr-2 text-base">{s.icon}</span>
              <span className="truncate">{s.label}</span>
            </DropdownMenuItem>
          ))
        })()}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
