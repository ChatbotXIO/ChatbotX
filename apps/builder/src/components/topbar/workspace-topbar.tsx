"use client"

import Link from "next/link"
import { BrandIcon } from "@/components/brand-icon"
import type { WorkspaceResource } from "@/features/workspaces/schema/resource"
import { authClient } from "@/lib/auth/auth-client"
import { useTopbarStacks } from "./topbar-slot-context"
import { TopbarUserMenu } from "./topbar-user-menu"
import { TopbarWorkspaceSwitcher } from "./topbar-workspace-switcher"

type WorkspaceTopbarProps = {
  allWorkspaces: WorkspaceResource[]
}

/**
 * Topbar global do workspace — altura padrão `h-14` (56px). Fica fixo no
 * topo da tela em TODAS as páginas dentro de `/space/[workspaceId]/*`,
 * estilo Respond.io.
 *
 * Layout:
 *  ┌──────────────────────────────────────────────────────────────────┐
 *  │ [Brand X] [WorkspaceSwitcher] | [pageTitle slot]    [pageActions]│
 *  │                                                       [NavUser]  │
 *  └──────────────────────────────────────────────────────────────────┘
 *
 *  - `pageTitle` / `pageActions` são slots dinâmicos: cada página registra
 *    seu próprio conteúdo via `useTopbarSlot()`. Quando a página desmonta,
 *    o slot é removido automaticamente.
 *
 * Pedro pediu padronização: "no Respond.io toda aba tem essa parte na
 * horizontal, é padrão do mesmo tamanho". Esse componente garante.
 */
export function WorkspaceTopbar({ allWorkspaces }: WorkspaceTopbarProps) {
  const { data: session } = authClient.useSession()
  const { pageTitle, pageActions } = useTopbarStacks()

  const user = {
    name: session?.user.name ?? "",
    email: session?.user.email ?? "",
    avatar: session?.user.image ?? "",
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-3">
      {/* Brand fixo no canto esquerdo */}
      <Link
        aria-label="Início"
        className="flex size-9 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-accent"
        href="/"
      >
        <BrandIcon alt="Marca" />
      </Link>

      {/* Workspace switcher (dropdown pra trocar workspace) */}
      <div className="shrink-0">
        <TopbarWorkspaceSwitcher workspaces={allWorkspaces} />
      </div>

      <div className="mx-1 h-6 w-px shrink-0 bg-border" />

      {/* Slot dinâmico de título / nav contextual da página */}
      <div className="flex min-w-0 flex-1 items-center gap-2">{pageTitle}</div>

      {/* Slot dinâmico de ações da página (publicar, +adicionar, etc) */}
      {pageActions && (
        <div className="flex shrink-0 items-center gap-2">{pageActions}</div>
      )}

      {/* User menu sempre fixo no extremo direito */}
      <div className="shrink-0">
        <TopbarUserMenu user={user} />
      </div>
    </header>
  )
}
