"use client"

import type {
  InboxTeamModel,
  LifecycleStageModel,
} from "@chatbotx.io/database/types"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  BanIcon,
  InboxIcon,
  type LucideIcon,
  PanelLeftCloseIcon,
  UserIcon,
  UserSearchIcon,
  UsersRoundIcon,
} from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { useInboxSidebarCollapsed } from "@/features/chat/hooks/use-inbox-sidebar-collapsed"

const LIFECYCLE_VISIBILITY_KEY = "chatbotx.lifecycle.visible"

// Pixel-perfect Respond.io 2026-05-26 (Pedro: "o sidebar tanto da
// direita quanto da esquerda são exatamente iguais ao do inbox,
// literalmente o mesmo, corrija isso"). Estrutura visual + JSX +
// classes Tailwind copiadas LITERALMENTE do <InboxAreaSidebar>
// com adaptação de comportamento:
//   - Inbox: muta chatStore + loadMoreConversations() + actions de
//     marcar leitura.
//   - Contacts: navega via URL search params (assignedId, lifecycleStageId,
//     blocked) pra refiltar a lista de contatos no servidor. Active state
//     vem de useSearchParams().
function formatCount(count: number): string {
  return count > 9999 ? "9,999+" : count.toLocaleString("pt-BR")
}

function renderCountBadge(
  count: number,
  hasUnread: boolean,
  t: ReturnType<typeof useTranslations>,
) {
  if (hasUnread) {
    return (
      <span
        aria-label={t("inboxFilters.newMessageIndicator")}
        className="inline-grid h-5 min-w-[20px] shrink-0 place-items-center rounded-[10px] bg-primary px-1.5 font-bold text-[12px] text-primary-foreground"
        role="status"
      >
        {count > 0 ? formatCount(count) : ""}
      </span>
    )
  }
  if (count > 0) {
    return (
      <span className="shrink-0 font-bold text-[13px] text-text-secondary">
        {formatCount(count)}
      </span>
    )
  }
  return null
}

type AssignmentCounts = {
  all: number
  mine: number
  unassigned: number
  teams: Record<string, number>
}

type ContactsAreaSidebarProps = {
  workspaceId: string
  currentUserId: string
  inboxTeams: InboxTeamModel[]
  lifecycleStages: LifecycleStageModel[]
  lifecycleCounts: Record<string, number>
  assignmentCounts: AssignmentCounts
  unreadByAssignment: AssignmentCounts
  unreadByStage: Record<string, number>
  blockedContactsCount: number
}

type TopFilterItem = {
  key: string
  label: string
  icon: LucideIcon
  href: string
  isActive: boolean
  count: number
  showDot: boolean
}

export function ContactsAreaSidebar({
  workspaceId,
  currentUserId,
  inboxTeams,
  lifecycleStages,
  lifecycleCounts,
  assignmentCounts,
  unreadByAssignment,
  unreadByStage,
  blockedContactsCount,
}: ContactsAreaSidebarProps) {
  const t = useTranslations()
  const searchParams = useSearchParams()
  const [collapsed, toggleCollapsed] = useInboxSidebarCollapsed()

  const base = `/space/${workspaceId}/contacts`
  const currentAssignedId = searchParams.get("assignedId") ?? "all"
  const currentLifecycleId = searchParams.get("lifecycleStageId")
  const isBlockedFilterActive = searchParams.get("blocked") === "1"

  // Lost stages ocultos (decisão Respond.io — só no Settings).
  const activeLifecycleStages = lifecycleStages.filter((s) => !s.isLost)

  // Toggle global do localStorage (controla se a seção Ciclo de vida aparece).
  // Compartilha a mesma chave do Inbox pra estado consistente entre páginas.
  const [lifecycleVisible, setLifecycleVisible] = useState(true)
  useEffect(() => {
    const stored = localStorage.getItem(LIFECYCLE_VISIBILITY_KEY)
    if (stored !== null) {
      setLifecycleVisible(stored === "true")
    }
    const handler = (e: StorageEvent) => {
      if (e.key === LIFECYCLE_VISIBILITY_KEY && e.newValue !== null) {
        setLifecycleVisible(e.newValue === "true")
      }
    }
    window.addEventListener("storage", handler)
    return () => window.removeEventListener("storage", handler)
  }, [])

  // Helpers de URL — mesmo padrão das outras páginas que usam URL params.
  const buildHref = (
    overrides: Record<string, string | null | undefined>,
  ): string => {
    const params = new URLSearchParams(searchParams.toString())
    for (const [key, value] of Object.entries(overrides)) {
      if (value === null || value === undefined || value === "") {
        params.delete(key)
      } else {
        params.set(key, value)
      }
    }
    const qs = params.toString()
    return qs ? `${base}?${qs}` : base
  }

  // Prioridade da bolinha "nova mensagem" (doc Respond.io):
  // Minhas > Equipe > Não atribuídas > Todas.
  const anyTeamUnread = Object.values(unreadByAssignment.teams).some(
    (c) => c > 0,
  )
  const showAllDot =
    unreadByAssignment.all > 0 &&
    unreadByAssignment.mine === 0 &&
    unreadByAssignment.unassigned === 0 &&
    !anyTeamUnread
  const showMineDot = unreadByAssignment.mine > 0
  const showUnassignedDot =
    unreadByAssignment.unassigned > 0 &&
    unreadByAssignment.mine === 0 &&
    !anyTeamUnread
  const showTeamDot = (teamId: string): boolean =>
    (unreadByAssignment.teams[teamId] ?? 0) > 0 && unreadByAssignment.mine === 0

  const topItems: TopFilterItem[] = [
    {
      key: "all",
      label: t("inboxFilters.all"),
      icon: InboxIcon,
      href: buildHref({
        assignedId: null,
        lifecycleStageId: null,
        blocked: null,
      }),
      isActive:
        !(isBlockedFilterActive || currentLifecycleId) &&
        (currentAssignedId === "all" || !searchParams.get("assignedId")),
      count: assignmentCounts.all,
      showDot: showAllDot,
    },
    {
      key: "mine",
      label: t("inboxFilters.mine"),
      icon: UserIcon,
      href: buildHref({
        assignedId: `u_${currentUserId}`,
        lifecycleStageId: null,
        blocked: null,
      }),
      isActive:
        !isBlockedFilterActive && currentAssignedId === `u_${currentUserId}`,
      count: assignmentCounts.mine,
      showDot: showMineDot,
    },
    {
      key: "unassigned",
      label: t("inboxFilters.unassigned"),
      icon: UserSearchIcon,
      href: buildHref({
        assignedId: "unassigned",
        lifecycleStageId: null,
        blocked: null,
      }),
      isActive: !isBlockedFilterActive && currentAssignedId === "unassigned",
      count: assignmentCounts.unassigned,
      showDot: showUnassignedDot,
    },
  ]

  if (collapsed) {
    return null
  }

  return (
    <aside className="flex h-full w-[215px] shrink-0 flex-col border-border border-r bg-app-surface text-text-secondary">
      <div className="flex h-[43px] shrink-0 items-center justify-between px-3">
        <h2 className="truncate font-bold text-[14px] text-text-secondary">
          {t("contacts.title")}
        </h2>
        <button
          aria-label={t("inboxFilters.collapseSidebar")}
          className="grid size-7 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-app-surface-2 hover:text-text-secondary"
          onClick={() => toggleCollapsed(true)}
          type="button"
        >
          <PanelLeftCloseIcon className="size-4" strokeWidth={1.75} />
        </button>
      </div>
      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-2 pb-3">
        {/* Filtros top: Todos / Minhas / Não atribuídas */}
        <div className="flex flex-col gap-0.5">
          {topItems.map((item) => {
            const Icon = item.icon
            const showUnreadBadge = item.showDot && !item.isActive
            return (
              <Link
                className={cn(
                  "flex h-8 items-center gap-2 rounded-[4px] px-2.5 text-left text-[14px] transition-colors",
                  item.isActive
                    ? "bg-app-surface-2 font-semibold text-text-secondary"
                    : "font-normal text-text-secondary/90 hover:bg-app-surface-2/60",
                )}
                href={item.href}
                key={item.key}
              >
                <Icon
                  className={cn(
                    "size-4 shrink-0",
                    item.isActive ? "text-primary" : "text-muted-foreground",
                  )}
                />
                <span className="flex-1 truncate">{item.label}</span>
                {renderCountBadge(item.count, showUnreadBadge, t)}
              </Link>
            )
          })}
        </div>

        {/* Times */}
        {inboxTeams.length > 0 && (
          <div className="flex flex-col gap-0.5">
            <span className="px-2 pb-1 font-bold text-[11px] text-muted-foreground uppercase tracking-[0.13em]">
              {t("inboxFilters.teamInbox")}
            </span>
            {inboxTeams.map((team) => {
              const teamFilterValue = `t_${team.id}`
              const active =
                !isBlockedFilterActive && currentAssignedId === teamFilterValue
              const teamCount = assignmentCounts.teams[team.id] ?? 0
              const teamShowDot = showTeamDot(team.id) && !active
              return (
                <Link
                  className={cn(
                    "flex h-8 items-center gap-2.5 rounded-[4px] px-2.5 text-left text-[14px] transition-colors",
                    active
                      ? "bg-app-surface-2 font-semibold text-text-secondary"
                      : "font-normal text-text-secondary/90 hover:bg-app-surface-2/60",
                  )}
                  href={buildHref({
                    assignedId: teamFilterValue,
                    lifecycleStageId: null,
                    blocked: null,
                  })}
                  key={team.id}
                >
                  <UsersRoundIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{team.name}</span>
                  {renderCountBadge(teamCount, teamShowDot, t)}
                </Link>
              )
            })}
          </div>
        )}

        {/* Ciclo de vida */}
        {lifecycleVisible && activeLifecycleStages.length > 0 && (
          <div className="flex flex-col gap-0.5">
            <span className="px-2 pb-1 font-semibold text-[12px] text-muted-foreground uppercase tracking-[0.05em]">
              {t("lifecycle.title")}
            </span>
            {activeLifecycleStages.map((stage) => {
              const active =
                !isBlockedFilterActive && currentLifecycleId === stage.id
              const count = lifecycleCounts[stage.id] ?? 0
              const stageHasUnread = (unreadByStage[stage.id] ?? 0) > 0
              const stageShowDot = stageHasUnread && !active
              return (
                <Link
                  className={cn(
                    "flex h-8 items-center gap-2.5 rounded-[4px] px-2 text-left text-[14px] transition-colors",
                    active
                      ? "bg-app-surface-2 font-semibold text-text-secondary"
                      : "font-normal text-text-secondary/90 hover:bg-app-surface-2/60",
                  )}
                  href={buildHref({
                    assignedId: null,
                    lifecycleStageId: active ? null : stage.id,
                    blocked: null,
                  })}
                  key={stage.id}
                >
                  <span className="w-5 shrink-0 text-center text-[17px] leading-none">
                    {stage.icon ?? "•"}
                  </span>
                  <span className="flex-1 truncate text-[#a6adb7]">
                    {stage.name}
                  </span>
                  {renderCountBadge(count, stageShowDot, t)}
                </Link>
              )
            })}
          </div>
        )}
      </nav>

      {/* Rodapé fixo — Contatos bloqueados (pixel-perfect Respond.io) */}
      <div className="shrink-0 border-white/[0.06] border-t px-2 py-2">
        <Link
          className={cn(
            "flex h-8 w-full items-center gap-2 rounded-[4px] px-2.5 text-left text-[14px] transition-colors",
            isBlockedFilterActive
              ? "bg-app-surface-2 font-semibold text-text-secondary"
              : "font-normal text-text-secondary/90 hover:bg-app-surface-2/60",
          )}
          href={
            isBlockedFilterActive
              ? buildHref({
                  blocked: null,
                  assignedId: null,
                  lifecycleStageId: null,
                })
              : buildHref({
                  blocked: "1",
                  assignedId: null,
                  lifecycleStageId: null,
                })
          }
        >
          <BanIcon
            className={cn(
              "size-4 shrink-0",
              isBlockedFilterActive ? "text-primary" : "text-muted-foreground",
            )}
            strokeWidth={1.75}
          />
          <span className="flex-1 truncate">
            {t("inboxFilters.blockedContacts")}
          </span>
          {blockedContactsCount > 0 && (
            <span className="shrink-0 font-bold text-[13px] text-text-secondary">
              {formatCount(blockedContactsCount)}
            </span>
          )}
        </Link>
      </div>
    </aside>
  )
}
