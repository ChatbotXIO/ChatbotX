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
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { useEffect, useState } from "react"
import { useInboxSidebarCollapsed } from "@/features/chat/hooks/use-inbox-sidebar-collapsed"
import { useChatStore } from "@/features/chat/store/chat-store-provider"
import { markFilterReadAction } from "@/features/conversations/actions/mark-filter-read.action"
import { getLifecycleCountsAction } from "@/features/lifecycle-stages/actions/get-lifecycle-counts-action"

const LIFECYCLE_VISIBILITY_KEY = "chatbotx.lifecycle.visible"
const LIFECYCLE_COUNTS_POLL_MS = 30_000

// Pixel-perfect Respond.io (imagens da doc inbox/d65db886a8bfb0d1.jpg +
// 478c584c4b3fd148.jpg + a2f6f064d7e40900.jpg):
//   - Sem unread: número simples negrito à direita, sem fundo.
//   - Com unread: pill azul brilhante (bg-primary) com NÚMERO DENTRO em
//     branco. NÃO é bolinha separada do número — é o próprio pill.
//   - Count 0 + sem unread: nada renderizado.
function formatCount(count: number): string {
  return count > 9999 ? "9,999+" : count.toLocaleString("pt-BR")
}

function renderCountBadge(
  count: number,
  hasUnread: boolean,
  t: ReturnType<typeof useTranslations>,
) {
  if (hasUnread) {
    // O número virou indicador "nova mensagem" — pill azul brilhante.
    // Quando count for 0 (raro mas possível), mostra o pill mesmo assim
    // pra sinalizar que TEM unread.
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
    // Só contagem de conversas abertas, sem unread — número simples negrito.
    return (
      <span className="shrink-0 font-bold text-[13px] text-text-secondary">
        {formatCount(count)}
      </span>
    )
  }
  return null
}

type InboxFilterItem = {
  key: string
  label: string
  icon: LucideIcon
  assignedId: string
  isActive: (currentAssignedId: string | undefined) => boolean
  onSelect: () => void
}

type AssignmentCounts = {
  all: number
  mine: number
  unassigned: number
  teams: Record<string, number>
}

type InboxAreaSidebarProps = {
  workspaceId: string
  currentUserId: string
  inboxTeams: InboxTeamModel[]
  lifecycleStages: LifecycleStageModel[]
  // Contagens de CONVERSAS ABERTAS por stage (badge ao lado de cada
  // "Novo Lead", "Lead Quente" etc) — não é número de contatos. Alinhado
  // com docs Respond.io ("Contagem de conversas abertas").
  lifecycleCounts: Record<string, number>
  // Contagens dos filtros top (Todos / Minhas / Não atribuídas + teams).
  assignmentCounts: AssignmentCounts
  // Recortes COM conversas NÃO LIDAS (contactLastReadAt > agentLastReadAt).
  // Usados pro indicador "nova mensagem" (bolinha azul que segue prioridade
  // Minhas > Equipe > Não atribuídas > Todas — doc Respond.io). Some quando
  // filtro é ativo.
  unreadByAssignment: AssignmentCounts
  unreadByStage: Record<string, number>
  // Quantidade de contatos com `blockedAt IS NOT NULL`. Usado no item
  // "Contatos bloqueados" do rodapé do sidebar (pixel-perfect Respond.io).
  blockedContactsCount: number
}

export function InboxAreaSidebar({
  workspaceId,
  currentUserId,
  inboxTeams,
  lifecycleStages,
  lifecycleCounts,
  assignmentCounts,
  unreadByAssignment,
  unreadByStage,
  blockedContactsCount,
}: InboxAreaSidebarProps) {
  const t = useTranslations()
  const [collapsed, toggleCollapsed] = useInboxSidebarCollapsed()
  const filters = useChatStore((state) => state.filters)
  const setFilters = useChatStore((state) => state.setFilters)
  const resetState = useChatStore((state) => state.resetState)
  const loadMoreConversations = useChatStore(
    (state) => state.loadMoreConversations,
  )

  // Quando filter "Contatos bloqueados" tá ativo, ele é EXCLUSIVO: os
  // outros filtros do topo (Todos/Minhas/Não atribuídas), teams e lifecycle
  // stages perdem o highlight de "ativo" mesmo que o assignedId/lifecycleId
  // ainda esteja setado no store. Pedro pediu 2026-05-25 — comportamento
  // de "caixa especial" igual Respond.io.
  const isBlockedFilterActive = filters.tags?.includes("blocked") ?? false
  const currentAssignedId = isBlockedFilterActive
    ? "__blocked__"
    : (filters.assignedId ?? "all")
  const currentLifecycleId = isBlockedFilterActive
    ? null
    : (filters.lifecycleStageId ?? null)
  // Lost stages ficam OCULTOS no Inbox (igual Respond.io) — só aparecem nas configurações
  const activeLifecycleStages = lifecycleStages.filter((s) => !s.isLost)

  // Lê o toggle global do localStorage (controla se a seção Ciclo de vida aparece)
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

  // Polling 30s das contagens (mantém sidebar fresca quando uma conversa
  // muda de stage / é arquivada / é atribuída / leitura). Re-busca todas
  // as 4 séries (counts + unread por stage e assignment) numa só chamada.
  const [polledLifecycle, setPolledLifecycle] =
    useState<Record<string, number>>(lifecycleCounts)
  const [polledAssignment, setPolledAssignment] =
    useState<AssignmentCounts>(assignmentCounts)
  const [polledUnreadStage, setPolledUnreadStage] =
    useState<Record<string, number>>(unreadByStage)
  const [polledUnreadAssignment, setPolledUnreadAssignment] =
    useState<AssignmentCounts>(unreadByAssignment)
  useEffect(() => {
    let mounted = true
    const teamIds = inboxTeams.map((t) => t.id)
    const boundAction = getLifecycleCountsAction.bind(null, workspaceId)
    const tick = async () => {
      try {
        const result = await boundAction({ teamIds })
        if (mounted && result?.data) {
          setPolledLifecycle(result.data.byStage)
          setPolledAssignment(result.data.byAssignment)
          setPolledUnreadStage(result.data.unreadByStage)
          setPolledUnreadAssignment(result.data.unreadByAssignment)
        }
      } catch {
        // silent — manter contagem anterior
      }
    }
    const interval = setInterval(tick, LIFECYCLE_COUNTS_POLL_MS)
    return () => {
      mounted = false
      clearInterval(interval)
    }
  }, [workspaceId, inboxTeams.map])
  const counts = polledLifecycle
  const assignCounts = polledAssignment
  const unreadStage = polledUnreadStage
  const unreadAssign = polledUnreadAssignment

  // Optimistic update da bolinha "nova mensagem": zera o recorte
  // localmente assim que o user clica. UPDATE no DB roda em background;
  // polling 30s reconfirma. Doc: "Ao abrir a caixa de entrada, o ponto
  // azul desaparece."
  const markAssignmentReadOptimistic = (assignedId: string) => {
    // Cada filtro zera APENAS seu próprio recorte. "Todos" não toca em
    // lifecycle stages (decisão Pedro 2026-05-24 — visão "Todos" é só
    // mudar de visão, não confirma leitura geral).
    setPolledUnreadAssignment((prev) => {
      if (assignedId === "all") {
        return { all: 0, mine: 0, unassigned: 0, teams: {} }
      }
      if (assignedId === `u_${currentUserId}`) {
        return { ...prev, mine: 0, all: Math.max(0, prev.all - prev.mine) }
      }
      if (assignedId === "unassigned") {
        return {
          ...prev,
          unassigned: 0,
          all: Math.max(0, prev.all - prev.unassigned),
        }
      }
      if (assignedId.startsWith("t_")) {
        const teamId = assignedId.slice(2)
        const teamCount = prev.teams[teamId] ?? 0
        return {
          ...prev,
          teams: { ...prev.teams, [teamId]: 0 },
          all: Math.max(0, prev.all - teamCount),
        }
      }
      return prev
    })
  }

  const markLifecycleReadOptimistic = (stageId: string) => {
    setPolledUnreadStage((prev) => ({ ...prev, [stageId]: 0 }))
  }

  // Hook do next-safe-action (chamada direta sem useAction não dispara
  // o handler). EXCEÇÃO: "Todos" não confirma leitura — só muda visão.
  const { execute: executeMarkFilterRead } = useAction(
    markFilterReadAction.bind(null, workspaceId),
  )

  // Helper: remove a tag "blocked" do array (preservando outras tags).
  // Top items / lifecycle / teams SEMPRE chamam isto pra desativar a
  // "caixa de bloqueados" automaticamente quando o user volta pra um
  // filtro normal — comportamento exclusivo igual sidebar do Respond.io
  // (Pedro reforçou 2026-05-25: "quando volto pra Todos, sai do blocked").
  const stripBlocked = () =>
    (filters.tags ?? []).filter((tag) => tag !== "blocked")

  const applyFilter = (assignedId: string) => {
    setFilters({
      ...filters,
      assignedId,
      lifecycleStageId: null,
      tags: stripBlocked(),
    })
    resetState()
    loadMoreConversations(workspaceId)
    markAssignmentReadOptimistic(assignedId)
    if (assignedId === "all") {
      // no-op
    } else if (assignedId === `u_${currentUserId}`) {
      executeMarkFilterRead({ scope: "mine", userId: currentUserId })
    } else if (assignedId === "unassigned") {
      executeMarkFilterRead({ scope: "unassigned" })
    } else if (assignedId.startsWith("t_")) {
      executeMarkFilterRead({ scope: "team", teamId: assignedId.slice(2) })
    }
  }

  const applyLifecycleFilter = (stageId: string | null) => {
    setFilters({
      ...filters,
      lifecycleStageId: stageId,
      tags: stripBlocked(),
    })
    resetState()
    loadMoreConversations(workspaceId)
    if (stageId) {
      markLifecycleReadOptimistic(stageId)
      executeMarkFilterRead({ scope: "lifecycle", stageId })
    }
  }

  // Filtro "Contatos bloqueados" (rodapé) — exclusivo dos filtros
  // assignment/lifecycle. Clicar nele LIMPA assignedId/lifecycleStageId
  // e ativa `tags: ["blocked"]`. Clicar de novo (toggle off) volta pra
  // visão "Todos". Quando o user clica em qualquer outro filtro
  // (Todos / Minhas / Lifecycle / Team), `stripBlocked()` desativa este
  // automaticamente.
  const applyBlockedFilter = () => {
    if (isBlockedFilterActive) {
      // Toggle off — volta pra visão padrão "Todos".
      setFilters({
        ...filters,
        tags: stripBlocked(),
        assignedId: "all",
        lifecycleStageId: null,
      })
    } else {
      // Toggle on — limpa outros filtros e ativa apenas blocked.
      setFilters({
        ...filters,
        tags: [...stripBlocked(), "blocked" as const],
        assignedId: "all",
        lifecycleStageId: null,
      })
    }
    resetState()
    loadMoreConversations(workspaceId)
  }

  // Prioridade da bolinha "nova mensagem" (doc Respond.io):
  //   Minhas > Equipe > Não atribuídas > Todas.
  // Se um nível superior tem unread, esconde dos níveis inferiores.
  const anyTeamUnread = Object.values(unreadAssign.teams).some((c) => c > 0)
  const showAllDot =
    unreadAssign.all > 0 &&
    unreadAssign.mine === 0 &&
    unreadAssign.unassigned === 0 &&
    !anyTeamUnread
  const showMineDot = unreadAssign.mine > 0
  const showUnassignedDot =
    unreadAssign.unassigned > 0 && unreadAssign.mine === 0 && !anyTeamUnread
  const showTeamDot = (teamId: string): boolean =>
    (unreadAssign.teams[teamId] ?? 0) > 0 && unreadAssign.mine === 0

  // Cada filtro top vem com a count real de conversas abertas naquele
  // recorte + flag `showDot` que indica se DEVE renderizar a bolinha azul
  // "nova mensagem" (segue prioridade Minhas > Equipe > Não atribuídas >
  // Todas — doc Respond.io). Esconde quando filtro está ativo.
  const topItems: Array<InboxFilterItem & { count: number; showDot: boolean }> =
    [
      {
        key: "all",
        label: t("inboxFilters.all"),
        icon: InboxIcon,
        assignedId: "all",
        count: assignCounts.all,
        showDot: showAllDot,
        isActive: (current) =>
          !current ||
          current === "all" ||
          (current !== "unassigned" &&
            !current.startsWith("u_") &&
            !current.startsWith("t_")),
        onSelect: () => applyFilter("all"),
      },
      {
        key: "mine",
        label: t("inboxFilters.mine"),
        icon: UserIcon,
        assignedId: `u_${currentUserId}`,
        count: assignCounts.mine,
        showDot: showMineDot,
        isActive: (current) => current === `u_${currentUserId}`,
        onSelect: () => applyFilter(`u_${currentUserId}`),
      },
      {
        key: "unassigned",
        label: t("inboxFilters.unassigned"),
        icon: UserSearchIcon,
        assignedId: "unassigned",
        count: assignCounts.unassigned,
        showDot: showUnassignedDot,
        isActive: (current) => current === "unassigned",
        onSelect: () => applyFilter("unassigned"),
      },
    ]

  // Collapsed: sidebar 215px some inteira. Botão "expandir" mora no
  // chat-layout (renderiza só quando collapsed lendo do mesmo hook).
  if (collapsed) {
    return null
  }

  return (
    // Pixel-perfect Respond.io 2026-05-24:
    //   bg `--app-surface` (#222225), w 215, border-right padrão.
    //   Header 43px com font 14/700 + search + collapse à direita.
    //   Filtros 32px h (medido no Respond ao vivo), lifecycle 32px h.
    //   Section labels uppercase letter-spacing pra parecer respond.io.
    //   Badge contagem com pill bg-primary (azul) igual mapping do Diego.
    // Layout em 3 partes (Pedro pediu 2026-05-25 — pixel-perfect Respond.io):
    //   1. Header 43px (título + collapse)
    //   2. Conteúdo principal scrollável (filtros + teams + lifecycle)
    //   3. Rodapé fixo com "Contatos bloqueados" (igual Respond.io)
    <aside className="flex h-full w-[215px] shrink-0 flex-col border-border border-r bg-app-surface text-text-secondary">
      {/* Header 43px exato — alinhado com altura do topbar do AppSidebar.
          Só o título + botão collapse (RespondIcon sidebar-left, iconfont
          Respond.io/iconsax). Lupa removida — search só voltará quando
          tiver implementação real. */}
      <div className="flex h-[43px] shrink-0 items-center justify-between px-3">
        <h2 className="truncate font-bold text-[14px] text-text-secondary">
          {t("fields.inbox.label")}
        </h2>
        <button
          aria-label={t("inboxFilters.collapseSidebar")}
          className="grid size-7 shrink-0 place-items-center rounded text-muted-foreground transition-colors hover:bg-app-surface-2 hover:text-text-secondary"
          onClick={() => toggleCollapsed(true)}
          type="button"
        >
          {/* PanelLeftCloseIcon (lucide) — fallback temporário enquanto
              investigo por que glyph iconsax sidebar-left renderiza como
              quadrado simples no 18px. CSS+font tudo OK no debug. */}
          <PanelLeftCloseIcon className="size-4" strokeWidth={1.75} />
        </button>
      </div>
      <nav className="flex flex-1 flex-col gap-4 overflow-y-auto px-2 pb-3">
        {/* Filtros top: 36px h, padding 0 10, radius 4 (mapping Diego)
            + badge à direita com conversas abertas naquele recorte. */}
        <div className="flex flex-col gap-0.5">
          {topItems.map((item) => {
            const Icon = item.icon
            const active = item.isActive(currentAssignedId)
            // "Nova mensagem" (doc Respond.io getting-started-with-inbox.md):
            // quando o recorte tem unread, o NÚMERO fica DENTRO de um pill
            // azul brilhante (não é bolinha separada). Some quando o filtro
            // é ativo. Quando NÃO tem unread, número fica solto sem pill.
            const showUnreadBadge = item.showDot && !active
            return (
              <button
                className={cn(
                  // font-weight muda com active (Pedro 2026-05-25 iteração 12):
                  // Respond.io usa weight 600 (semibold) pro item ativo e
                  // 400 (regular) pros inativos. Confirmado via Chrome MCP
                  // (Todos=600, Minhas=400).
                  "flex h-8 items-center gap-2 rounded-[4px] px-2.5 text-left text-[14px] transition-colors",
                  active
                    ? "bg-app-surface-2 font-semibold text-text-secondary"
                    : "font-normal text-text-secondary/90 hover:bg-app-surface-2/60",
                )}
                key={item.key}
                onClick={item.onSelect}
                type="button"
              >
                <Icon
                  className={cn(
                    "size-4 shrink-0",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                />
                <span className="flex-1 truncate">{item.label}</span>
                {renderCountBadge(item.count, showUnreadBadge, t)}
              </button>
            )
          })}
        </div>

        {inboxTeams.length > 0 && (
          <div className="flex flex-col gap-0.5">
            <span className="px-2 pb-1 font-bold text-[11px] text-muted-foreground uppercase tracking-[0.13em]">
              {t("inboxFilters.teamInbox")}
            </span>
            {inboxTeams.map((team) => {
              const teamFilterValue = `t_${team.id}`
              const active = currentAssignedId === teamFilterValue
              const teamCount = assignCounts.teams[team.id] ?? 0
              const teamShowDot = showTeamDot(team.id) && !active
              return (
                <button
                  className={cn(
                    "flex h-8 items-center gap-2.5 rounded-[4px] px-2.5 text-left text-[14px] transition-colors",
                    active
                      ? "bg-app-surface-2 font-semibold text-text-secondary"
                      : "font-normal text-text-secondary/90 hover:bg-app-surface-2/60",
                  )}
                  key={team.id}
                  onClick={() => applyFilter(teamFilterValue)}
                  type="button"
                >
                  <UsersRoundIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate">{team.name}</span>
                  {renderCountBadge(teamCount, teamShowDot, t)}
                </button>
              )
            })}
          </div>
        )}

        {/* Outros sections continuam */}
        {lifecycleVisible && activeLifecycleStages.length > 0 && (
          // Seção "Ciclo de vida" — label uppercase 12/600 muted (mapping Diego)
          <div className="flex flex-col gap-0.5">
            <span className="px-2 pb-1 font-semibold text-[12px] text-muted-foreground uppercase tracking-[0.05em]">
              {t("lifecycle.title")}
            </span>
            {activeLifecycleStages.map((stage) => {
              const active = currentLifecycleId === stage.id
              const count = counts[stage.id] ?? 0
              const stageHasUnread = (unreadStage[stage.id] ?? 0) > 0
              const stageShowDot = stageHasUnread && !active
              return (
                <button
                  className={cn(
                    "flex h-8 items-center gap-2.5 rounded-[4px] px-2 text-left text-[14px] transition-colors",
                    active
                      ? "bg-app-surface-2 font-semibold text-text-secondary"
                      : "font-normal text-text-secondary/90 hover:bg-app-surface-2/60",
                  )}
                  key={stage.id}
                  onClick={() => applyLifecycleFilter(active ? null : stage.id)}
                  type="button"
                >
                  <span className="w-5 shrink-0 text-center text-[17px] leading-none">
                    {stage.icon ?? "•"}
                  </span>
                  <span className="flex-1 truncate text-[#a6adb7]">
                    {stage.name}
                  </span>
                  {renderCountBadge(count, stageShowDot, t)}
                </button>
              )
            })}
          </div>
        )}
      </nav>

      {/* RODAPÉ FIXO — Item "Contatos bloqueados" (pixel-perfect Respond.io
          2026-05-25 — Pedro pediu). Click ativa filter tags: ["blocked"]
          que muda o backend pra mostrar conversas com `blockedAt IS NOT
          NULL` ao invés de filtrar fora. Toggle: clicar de novo volta
          ao normal. */}
      <div className="shrink-0 border-white/[0.06] border-t px-2 py-2">
        <button
          className={cn(
            "flex h-8 w-full items-center gap-2 rounded-[4px] px-2.5 text-left text-[14px] transition-colors",
            isBlockedFilterActive
              ? "bg-app-surface-2 font-semibold text-text-secondary"
              : "font-normal text-text-secondary/90 hover:bg-app-surface-2/60",
          )}
          onClick={applyBlockedFilter}
          type="button"
        >
          {/* Ícone `BanIcon` (sinal proibido — círculo com diagonal) =
              equivalente Lucide do `mdi-cancel` que o Respond.io usa
              (inspeção via Chrome MCP 2026-05-25). */}
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
        </button>
      </div>
    </aside>
  )
}
