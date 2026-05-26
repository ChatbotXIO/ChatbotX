"use client"

import type { LifecycleStageModel } from "@chatbotx.io/database/types"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { BanIcon, UsersIcon } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"

type ContactsAreaSidebarProps = {
  workspaceId: string
  blockedContactsCount: number
  lifecycleStages: LifecycleStageModel[]
}

// Sidebar fixo da página /contacts — pixel-perfect Respond.io (Pedro
// 2026-05-26: "o mesmo sidebar com ciclo de vida e as outras opções deve
// aparecer aqui em contatos também").
//
// Estrutura visual espelha o InboxAreaSidebar mas funcionalidade é mais
// enxuta (sem polling, sem ChatStore — navega via URL search params em vez
// de mutate Zustand). Filtros aplicáveis em /contacts:
//   • `lifecycleStageId=<id>` — filtra contatos por stage
//   • `blocked=1` — filtra só bloqueados (rodapé)
export function ContactsAreaSidebar({
  workspaceId,
  blockedContactsCount,
  lifecycleStages,
}: ContactsAreaSidebarProps) {
  const t = useTranslations()
  const searchParams = useSearchParams()
  const blockedActive = searchParams.get("blocked") === "1"
  const currentStageId = searchParams.get("lifecycleStageId")
  const base = `/space/${workspaceId}/contacts`

  // Lost stages ocultos (decisão Respond.io — só no Settings).
  const activeStages = lifecycleStages.filter((s) => !s.isLost)

  return (
    <aside className="flex h-full w-[215px] shrink-0 flex-col overflow-hidden border-r bg-sidebar text-sidebar-foreground">
      {/* Header 43 px */}
      <div className="flex h-[43px] shrink-0 items-center px-2 pt-3 pb-2">
        <h2 className="truncate font-semibold text-base">
          {t("contacts.title")}
        </h2>
      </div>

      {/* Conteúdo scrollável */}
      <nav className="flex flex-1 flex-col gap-3 overflow-y-auto px-2 py-2">
        {/* Filtros base */}
        <div className="flex flex-col gap-0.5">
          <Link
            className={cn(
              "flex h-8 items-center gap-2 rounded-md px-2 text-sm transition-colors",
              blockedActive || currentStageId
                ? "hover:bg-sidebar-accent/50"
                : "bg-sidebar-accent text-sidebar-accent-foreground",
            )}
            href={base}
          >
            <UsersIcon className="size-4 shrink-0" />
            <span className="truncate">{t("contacts.sidebar.all")}</span>
          </Link>
        </div>

        {/* Seção Ciclo de vida */}
        {activeStages.length > 0 && (
          <div className="flex flex-col gap-0.5">
            <span className="px-2 py-1 text-muted-foreground text-xs">
              {t("lifecycle.title")}
            </span>
            {activeStages.map((stage) => {
              const isActive = !blockedActive && currentStageId === stage.id
              return (
                <Link
                  className={cn(
                    "flex h-8 items-center gap-2 rounded-md px-2 text-sm transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "hover:bg-sidebar-accent/50",
                  )}
                  href={`${base}?lifecycleStageId=${stage.id}`}
                  key={stage.id}
                  title={stage.name}
                >
                  {stage.icon && (
                    <span
                      aria-hidden
                      className="shrink-0 text-base leading-none"
                    >
                      {stage.icon}
                    </span>
                  )}
                  <span className="truncate">{stage.name}</span>
                </Link>
              )
            })}
          </div>
        )}
      </nav>

      {/* Rodapé fixo — Contatos bloqueados (pixel-perfect Respond.io) */}
      <div className="shrink-0 border-white/[0.06] border-t p-2">
        <Link
          className={cn(
            "flex h-8 items-center gap-2 rounded-md px-2 text-sm transition-colors",
            blockedActive
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : "hover:bg-sidebar-accent/50",
          )}
          href={`${base}?blocked=1`}
        >
          <BanIcon className="size-4 shrink-0" />
          <span className="flex-1 truncate">
            {t("contacts.sidebar.blocked")}
          </span>
          {blockedContactsCount > 0 && (
            <span className="ml-auto rounded-[10px] bg-app-surface-2 px-1.5 py-0.5 font-bold text-[11px] text-muted-foreground">
              {blockedContactsCount > 999
                ? "999+"
                : blockedContactsCount.toString()}
            </span>
          )}
        </Link>
      </div>
    </aside>
  )
}
