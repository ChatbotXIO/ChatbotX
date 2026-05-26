"use client"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useTranslations } from "next-intl"
import { RespondIcon } from "@/components/respond-icon"

type InboxSideRailProps = {
  /** Drawer está aberto? Determina estado visual do botão (active). */
  drawerOpen: boolean
  /** Toggle do drawer. */
  onToggleDrawer: () => void
}

/**
 * Coluna fina vertical à direita (45 px), igual Respond.io.
 *
 * Pedro 2026-05-25 iter 40: simplificado pra UM ÚNICO BOTÃO
 * "Detalhes do contato" que faz toggle do drawer. Os 4 ícones antigos
 * (call, attach, clock) foram REMOVIDOS — Respond.io só tem o botão
 * do drawer em destaque. Outras abas (Channels/Activities/Attachments)
 * ficaram pra depois quando essas features existirem.
 *
 * Active state (azul) = drawer aberto. Click toggle.
 */
export function InboxSideRail({
  drawerOpen,
  onToggleDrawer,
}: InboxSideRailProps) {
  const t = useTranslations()
  const label = t("inboxSideRail.details") ?? "Detalhes do contato"

  return (
    <div className="flex h-full w-[45px] shrink-0 flex-col items-center gap-1 border-white/[0.06] border-l bg-app-surface py-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            aria-label={label}
            aria-pressed={drawerOpen}
            className={cn(
              "flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              drawerOpen && "bg-accent text-primary",
            )}
            onClick={onToggleDrawer}
            type="button"
          >
            <RespondIcon name="custom-user-square-bold" size="lg" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">{label}</TooltipContent>
      </Tooltip>
    </div>
  )
}
