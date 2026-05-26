"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { ArrowLeft2 } from "iconsax-reactjs"
import Link from "next/link"
import type { ReactNode } from "react"
import { type IconsaxComponent, wrapIconsax } from "@/components/iconsax-icon"

const ArrowLeftIcon = wrapIconsax(ArrowLeft2 as IconsaxComponent)

/**
 * PageHeader — componente padronizado de header de página.
 *
 * Altura fixa **52px** (`h-[52px]`) — bate com o padrão do Respond.io
 * (medido via Chrome MCP: Dashboard/Workflows/Settings = 53px). Pedro
 * pediu padronização: "no Respond.io toda aba tem essa parte na horizontal
 * do mesmo tamanho".
 *
 * Estrutura:
 *  - Botão de voltar opcional (se `backHref` for passado)
 *  - Título + subtítulo opcional + ações inline opcionais (esquerda)
 *  - Slot `actions` no extremo direito
 *
 * Cada página interna deve usar este componente em vez de header próprio
 * pra manter o "linha imaginária" consistente entre abas.
 */
export type PageHeaderProps = {
  /** Texto principal mostrado em destaque. */
  title: ReactNode
  /** Subtítulo opcional ao lado do título (cor mutada). */
  subtitle?: ReactNode
  /** Se passado, renderiza botão "voltar" no canto esquerdo. */
  backHref?: string
  /** Aria-label do botão voltar (default: "Voltar"). */
  backLabel?: string
  /** Conteúdo extra entre o título e o slot de ações (ex.: pencil). */
  titleAdornment?: ReactNode
  /** Botões/ações no extremo direito. */
  actions?: ReactNode
  /** Classes extras pra customizar (geralmente desnecessário). */
  className?: string
}

export function PageHeader({
  title,
  subtitle,
  backHref,
  backLabel = "Voltar",
  titleAdornment,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex h-[52px] shrink-0 items-center gap-2 border-b bg-background px-4",
        className,
      )}
    >
      {backHref && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              aria-label={backLabel}
              asChild
              className="size-8 shrink-0"
              size="icon"
              variant="ghost"
            >
              <Link href={backHref}>
                <ArrowLeftIcon className="size-4" />
              </Link>
            </Button>
          </TooltipTrigger>
          <TooltipContent>{backLabel}</TooltipContent>
        </Tooltip>
      )}

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <h1 className="truncate font-semibold text-base">{title}</h1>
        {subtitle && (
          <span className="truncate text-muted-foreground text-sm">
            {subtitle}
          </span>
        )}
        {titleAdornment}
      </div>

      {actions && (
        <div className="flex shrink-0 items-center gap-2">{actions}</div>
      )}
    </header>
  )
}
