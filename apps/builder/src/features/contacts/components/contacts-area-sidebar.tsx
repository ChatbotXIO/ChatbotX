"use client"

import { cn } from "@chatbotx.io/ui/lib/utils"
import { BanIcon, UsersIcon } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"

type ContactsAreaSidebarProps = {
  workspaceId: string
  blockedContactsCount: number
}

// Sidebar enxuta da página /contacts — espelha o padrão do Inbox mas mais
// simples (sem polling, sem collapse, sem filtros lifecycle ainda). Foco no
// rodapé "Contatos bloqueados" que Pedro pediu pixel-perfect Respond.io.
export function ContactsAreaSidebar({
  workspaceId,
  blockedContactsCount,
}: ContactsAreaSidebarProps) {
  const t = useTranslations()
  const searchParams = useSearchParams()
  const blockedActive = searchParams.get("blocked") === "1"
  const base = `/space/${workspaceId}/contacts`

  return (
    <aside className="flex w-[215px] shrink-0 flex-col overflow-y-auto border-r bg-sidebar text-sidebar-foreground">
      {/* Header 43 px */}
      <div className="flex h-[43px] shrink-0 items-center px-2 pt-3 pb-2">
        <h2 className="truncate font-semibold text-base">
          {t("contacts.title")}
        </h2>
      </div>

      {/* Conteúdo scrollável */}
      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2">
        <Link
          className={cn(
            "flex h-8 items-center gap-2 rounded-md px-2 text-sm transition-colors",
            blockedActive
              ? "hover:bg-sidebar-accent/50"
              : "bg-sidebar-accent text-sidebar-accent-foreground",
          )}
          href={base}
        >
          <UsersIcon className="size-4 shrink-0" />
          <span className="truncate">{t("contacts.sidebar.all")}</span>
        </Link>
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
