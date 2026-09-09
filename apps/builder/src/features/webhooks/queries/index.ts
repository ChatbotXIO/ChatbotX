import { webhookService } from "@chatbotx.io/business"
import { findWebhookWithConditions } from "@chatbotx.io/database/repositories"
import type { WebhookModel } from "@chatbotx.io/database/types"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type { WebhookCollection } from "../schema"
import type { GetWebhooksSchema } from "../schema/get-webhook-schema"

export async function getWebhooks(
  input: GetWebhooksSchema,
): Promise<WebhookCollection> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  return await webhookService.list(input)
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
