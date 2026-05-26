"use server"

import { lifecycleStageService } from "@chatbotx.io/business"
import type { LifecycleStageModel } from "@chatbotx.io/database/types"

export async function listLifecycleStages(
  workspaceId: string,
): Promise<LifecycleStageModel[]> {
  return await lifecycleStageService.listByWorkspaceId({ workspaceId })
}

// Conta CONTATOS por estágio (usado em /contacts pra mostrar quantos
// contatos têm cada lifecycle). NÃO é o badge do Inbox.
export async function countContactsByLifecycle(
  workspaceId: string,
): Promise<Record<string, number>> {
  return await lifecycleStageService.countContactsByStage({ workspaceId })
}

// Conta CONVERSAS ABERTAS por estágio do contato. Usado no sidebar do Inbox
// (badge ao lado de "Novo Lead", "Lead Quente" etc) — alinhado com docs
// Respond.io: "Contagem de conversas abertas indica o número de conversas
// abertas em uma Caixa de entrada".
export async function countOpenConversationsByLifecycle(
  workspaceId: string,
): Promise<Record<string, number>> {
  return await lifecycleStageService.countOpenConversationsByStage({
    workspaceId,
  })
}

// Contagens pros filtros top do sidebar (Todos / Minhas / Não atribuídas +
// teams). Inclui só conversas ABERTAS.
export async function countOpenConversationsByAssignment(
  workspaceId: string,
  currentUserId: string,
  teamIds: string[] = [],
): Promise<{
  all: number
  mine: number
  unassigned: number
  teams: Record<string, number>
}> {
  return await lifecycleStageService.countOpenConversationsByAssignment({
    workspaceId,
    currentUserId,
    teamIds,
  })
}

// Recortes (Todos/Minhas/Não atribuídas/teams) que TÊM conversa NÃO LIDA
// pelo agente. Usado pra indicador "nova mensagem" (ponto azul) na sidebar.
// Doc: markdown-raw/inbox/getting-started-with-inbox.md → "O indicador de
// nova mensagem é um ponto azul que aparece quando uma conversa tem uma
// nova mensagem recebida".
export async function countUnreadConversationsByAssignment(
  workspaceId: string,
  currentUserId: string,
  teamIds: string[] = [],
): Promise<{
  all: number
  mine: number
  unassigned: number
  teams: Record<string, number>
}> {
  return await lifecycleStageService.countUnreadByAssignment({
    workspaceId,
    currentUserId,
    teamIds,
  })
}

// Mesma coisa mas por lifecycle stage (pra bolinha "nova mensagem" ao
// lado de cada Ciclo de Vida).
export async function countUnreadConversationsByLifecycle(
  workspaceId: string,
): Promise<Record<string, number>> {
  return await lifecycleStageService.countUnreadByStage({ workspaceId })
}
