import {
  conditionRepository,
  findWebhookWithConditions,
  listWebhooksPaginated,
} from "@chatbotx.io/database/repositories"
import type { WebhookModel } from "@chatbotx.io/database/types"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { WebhookCollection } from "../schema"
import type { GetWebhooksSchema } from "../schema/get-webhook-schema"

export async function getWebhooks(
  input: GetWebhooksSchema,
): Promise<WebhookCollection> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  const { rows: webhooks, total } = await listWebhooksPaginated({
    workspaceId: input.workspaceId,
    folderId: input.folderId,
    name: input.name,
    limit: input.perPage,
    offset: (input.page - 1) * input.perPage,
  })

  const webhookIds = webhooks.map((w) => w.id)
  const conditionsData = await conditionRepository.listByWebhookIds(webhookIds)

  const data = webhooks.map((webhook) => ({
    ...webhook,
    conditions: conditionsData.filter((c) => c.webhookId === webhook.id),
  }))

  const pageCount = Math.ceil(total / input.perPage)

  return { data, pageCount }
}

export async function findWebhook(params: {
  id?: string
  workspaceId?: string
}): Promise<WebhookModel | null> {
  if (!(params.id || params.workspaceId)) {
    return null
  }

  return await findWebhookWithConditions(params)
}
