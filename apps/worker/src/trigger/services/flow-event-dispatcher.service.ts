/**
 * FlowEventDispatcher
 * ===================
 *
 * Espelha o `TriggerMatcherService` + `TriggerExecutorService`, mas pra um
 * caminho paralelo: **flows publicados que têm um `TriggerNode`** como entry
 * point (estilo Respond.io). Em vez de matchar contra a tabela `trigger`
 * + `condition`, varre os flowVersions atuais procurando por nodes
 * `type === "trigger"` cujo `details.triggerType` corresponde ao evento.
 *
 * Diferenças versus o trigger matcher tradicional:
 *  - Filtros ficam **dentro do node** (`node.data.details`), não em
 *    `condition` rows. Cada subtipo tem seus filtros (tagIds, fieldIds,
 *    stageIds, etc).
 *  - Cada match dispara **direto** o flow via `IntegrationJobAction.sendFlow`
 *    — não tem cadeia de actions; o flow inteiro É a ação.
 *  - Listas vazias de filtros = "qualquer" (igual Respond.io).
 */

import { db } from "@chatbotx.io/database/client"
import type { FlowTriggerNodeType } from "@chatbotx.io/database/partials"
import {
  IntegrationJobAction,
  integrationQueue,
} from "@chatbotx.io/worker-config"
import { logger } from "../../lib/logger"
import type { TriggerEventData } from "../types"

type TriggerNodeDetails = {
  triggerType: FlowTriggerNodeType
  // conversationOpened
  sources?: string[]
  // conversationClosed
  closingCategoryIds?: string[]
  closedBy?: string[]
  // contactFieldUpdated
  fieldIds?: string[]
  // contactTagUpdated
  action?: "added" | "removed" | "any"
  tagIds?: string[]
  // shortcut
  icon?: string
  label?: string
  // lifecycleStageChanged
  toStageIds?: string[]
  fromStageIds?: string[]
  triggerOnCleared?: boolean
}

type FlowNodeShape = {
  id: string
  type?: string
  data?: {
    isStartNode?: boolean
    details?: TriggerNodeDetails | Record<string, unknown>
    [k: string]: unknown
  }
  [k: string]: unknown
}

type FlowEdgeShape = {
  source?: string
  sourceHandle?: string
  target?: string
  [k: string]: unknown
}

/**
 * Mapeia evento que chega no worker pro `triggerType` do TriggerNode.
 * Eventos que NÃO podem ser usados como entry point de flow (ex.: `archived`,
 * `followUp`) ficam de fora — só os 6 tipos do `flowTriggerNodeTypes`.
 */
const EVENT_TO_TRIGGER_TYPE: Partial<Record<string, FlowTriggerNodeType>> = {
  conversationOpened: "conversationOpened",
  conversationClosed: "conversationClosed",
  customFieldValueChanged: "contactFieldUpdated",
  tagApplied: "contactTagUpdated",
  tagRemoved: "contactTagUpdated",
  shortcut: "shortcut",
  lifecycleStageChanged: "lifecycleStageChanged",
}

export class FlowEventDispatcherService {
  /**
   * Encontra flows publicados que devem ser disparados pelo evento e despacha
   * jobs `sendFlow` no integration queue.
   */
  async dispatch(eventData: TriggerEventData): Promise<number> {
    const { workspaceId, contactId, eventType, eventData: metadata } = eventData

    const triggerType = EVENT_TO_TRIGGER_TYPE[eventType]
    if (!triggerType) {
      return 0
    }

    // Carrega todos os flows ativos do workspace + a versão publicada.
    // OBS: poderíamos pré-filtrar via SQL em jsonb, mas como o volume de flows
    // por workspace é baixo (geralmente <30) o filtro em memória é simples e
    // confiável. Se virar gargalo dá pra adicionar um índice GIN no `nodes`.
    const flows = await db.query.flowModel.findMany({
      where: {
        workspaceId,
        active: true,
      },
      with: {
        flowVersion: true,
      },
    })

    const candidates: Array<{
      flowId: string
      triggerNodeId: string
      details: TriggerNodeDetails
    }> = []

    for (const flow of flows) {
      if (!(flow.currentVersionId && flow.flowVersion)) {
        continue
      }
      const nodes = (flow.flowVersion.nodes ?? []) as FlowNodeShape[]
      const triggerNode = nodes.find((n) => n?.type === "trigger")
      if (!triggerNode) {
        continue
      }
      const details = triggerNode.data?.details as
        | TriggerNodeDetails
        | undefined
      if (!details || details.triggerType !== triggerType) {
        continue
      }

      // Validação: o trigger node precisa ter pelo menos 1 edge saindo —
      // senão o flow não tem nada pra executar. Pula silenciosamente.
      const edges = (flow.flowVersion.edges ?? []) as FlowEdgeShape[]
      const hasOutEdge = edges.some(
        (e) =>
          e?.source === triggerNode.id || e?.sourceHandle === triggerNode.id,
      )
      if (!hasOutEdge) {
        continue
      }

      // Aplica filtros específicos do subtipo. Filtros vazios = "qualquer".
      if (!this.matchesFilters(details, eventType, metadata, flow.id)) {
        continue
      }

      candidates.push({
        flowId: flow.id,
        triggerNodeId: triggerNode.id,
        details,
      })
    }

    if (candidates.length === 0) {
      return 0
    }

    // Resolve conversation + contactInbox uma única vez por contato.
    const conversation = await db.query.conversationModel.findFirst({
      where: { workspaceId, contactId },
      orderBy: { createdAt: "desc" },
    })
    if (!conversation) {
      logger.warn(
        `[FlowEventDispatcher] No conversation for contact ${contactId}; skipping ${candidates.length} flows`,
      )
      return 0
    }
    const contactInbox = await db.query.contactInboxModel.findFirst({
      where: { contactId },
      orderBy: { lastMessageAt: "desc" },
    })
    if (!contactInbox) {
      logger.warn(
        `[FlowEventDispatcher] No contactInbox for contact ${contactId}; skipping ${candidates.length} flows`,
      )
      return 0
    }

    // Despacha jobs em paralelo. Cada flow roda independente.
    // Passamos `nodeId` explicitamente pro TriggerNode — assim o runFlowNode
    // entra exatamente no entry point que matchou (em vez de procurar
    // isStartNode automaticamente, o que daria mesmo resultado mas é mais
    // implícito).
    await Promise.all(
      candidates.map((c) =>
        integrationQueue.add(IntegrationJobAction.sendFlow, {
          type: IntegrationJobAction.sendFlow,
          data: {
            conversationId: conversation,
            contactInboxId: contactInbox,
            flowId: c.flowId,
            nodeId: c.triggerNodeId,
          },
        }),
      ),
    )

    logger.info(
      `[FlowEventDispatcher] Dispatched ${candidates.length} flows for event ${eventType} (contact ${contactId})`,
    )
    return candidates.length
  }

  /**
   * Valida filtros do TriggerNode contra o metadata do evento.
   * Convenção: array vazio/undefined = "qualquer" (sem filtro).
   */
  private matchesFilters(
    details: TriggerNodeDetails,
    eventType: string,
    metadata: Record<string, unknown>,
    flowId: string,
  ): boolean {
    switch (details.triggerType) {
      case "conversationOpened": {
        const sources = details.sources ?? []
        if (sources.length === 0) {
          return true
        }
        const evSource = (metadata.source as string | undefined) ?? "contact"
        return sources.includes(evSource)
      }

      case "conversationClosed": {
        const closingCategoryIds = details.closingCategoryIds ?? []
        const closedBy = details.closedBy ?? []
        const evCategoryId = metadata.closingCategoryId as string | undefined
        const evClosedBy = (metadata.closedBy as string | undefined) ?? "user"
        if (
          closingCategoryIds.length > 0 &&
          !(evCategoryId && closingCategoryIds.includes(evCategoryId))
        ) {
          return false
        }
        if (closedBy.length > 0 && !closedBy.includes(evClosedBy)) {
          return false
        }
        return true
      }

      case "contactFieldUpdated": {
        const fieldIds = details.fieldIds ?? []
        if (fieldIds.length === 0) {
          return true
        }
        const evFieldId = metadata.customFieldId as string | undefined
        return !!evFieldId && fieldIds.includes(evFieldId)
      }

      case "contactTagUpdated": {
        // action: added | removed | any
        const action = details.action ?? "any"
        if (action === "added" && eventType !== "tagApplied") {
          return false
        }
        if (action === "removed" && eventType !== "tagRemoved") {
          return false
        }
        const tagIds = details.tagIds ?? []
        if (tagIds.length === 0) {
          return true
        }
        const evTagId = metadata.tagId as string | undefined
        return !!evTagId && tagIds.includes(evTagId)
      }

      case "shortcut": {
        // Atalhos disparam UM flow específico (o que o agente clicou no
        // inbox). O emitter manda `metadata.flowId` — só matcha se for este.
        const targetFlowId = metadata.flowId as string | undefined
        return targetFlowId === flowId
      }

      case "lifecycleStageChanged": {
        const toStageIds = details.toStageIds ?? []
        const fromStageIds = details.fromStageIds ?? []
        const triggerOnCleared = details.triggerOnCleared ?? false
        const evTo = (metadata.toStageId as string | null) ?? null
        const evFrom = (metadata.fromStageId as string | null) ?? null

        // Se o lifecycle foi REMOVIDO (toStageId null) e o flow não opta
        // por capturar isso → skip.
        if (evTo === null && !triggerOnCleared) {
          return false
        }

        if (toStageIds.length > 0 && !(evTo && toStageIds.includes(evTo))) {
          return false
        }
        if (
          fromStageIds.length > 0 &&
          !(evFrom && fromStageIds.includes(evFrom))
        ) {
          return false
        }
        return true
      }

      default:
        return false
    }
  }
}
