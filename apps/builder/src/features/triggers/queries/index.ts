import {
  conditionRepository,
  triggerRepository,
} from "@chatbotx.io/database/repositories"
import type { TriggerModel } from "@chatbotx.io/database/types"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { GetTriggersSchema, ListTriggersResponse } from "../schema/query"

export async function getTriggers(
  input: GetTriggersSchema,
): Promise<ListTriggersResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const { rows: triggers, total } = await triggerRepository.listPaginated({
    workspaceId: input.workspaceId,
    folderId: input.folderId,
    name: input.name,
    limit: input.perPage,
    offset: (input.page - 1) * input.perPage,
  })

  const triggerIds = triggers.map((t) => t.id)
  const conditionsData = await conditionRepository.listByTriggerIds(triggerIds)

  const data = triggers.map((trigger) => ({
    ...trigger,
    conditions: conditionsData.filter((c) => c.triggerId === trigger.id),
  }))

  const pageCount = Math.ceil(total / input.perPage)

  return { data, pageCount }
}

export async function findTrigger(params: {
  id?: string
  workspaceId?: string
}): Promise<TriggerModel | null> {
  if (!(params.id || params.workspaceId)) {
    return null
  }

  return await triggerRepository.findWithConditions(params)
}
