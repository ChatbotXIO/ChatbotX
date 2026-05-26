"use server"

import { db } from "@chatbotx.io/database/client"

/**
 * Lista flows ativos do workspace cujo TriggerNode é do tipo "shortcut".
 * Usado pelo botão "Atalhos" no header da conversa (estilo Respond.io).
 *
 * Como o triggerType vive dentro do JSON `nodes` da flowVersion, filtramos em
 * memória após o fetch — o volume de flows por workspace é baixo (geralmente
 * <30) então o custo é desprezível.
 */
export type ShortcutFlow = {
  flowId: string
  label: string
  icon: string
}

type FlowNodeShape = {
  type?: string
  data?: {
    details?: {
      triggerType?: string
      icon?: string
      label?: string
    }
  }
}

export async function listShortcutFlows(
  workspaceId: string,
): Promise<ShortcutFlow[]> {
  const flows = await db.query.flowModel.findMany({
    where: {
      workspaceId,
      active: true,
    },
    with: {
      flowVersion: true,
    },
  })

  const result: ShortcutFlow[] = []
  for (const flow of flows) {
    if (!(flow.currentVersionId && flow.flowVersion)) {
      continue
    }
    const nodes = (flow.flowVersion.nodes ?? []) as FlowNodeShape[]
    const trigger = nodes.find((n) => n?.type === "trigger")
    if (!trigger) {
      continue
    }
    const details = trigger.data?.details
    if (!details || details.triggerType !== "shortcut") {
      continue
    }

    result.push({
      flowId: flow.id,
      label: details.label?.trim() || flow.name,
      icon: details.icon?.trim() || "⚡",
    })
  }
  return result
}
