import { webhookService } from "@chatbotx.io/business"
import { createSelectSchema, webhookModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnListingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPI } from "@/orpc"
import { conditionSchema } from "../../conditions/schemas"
import { toConditionColumns } from "../../conditions/to-condition-columns"

const webhookResource = createSelectSchema(webhookModel, {
  id: z.string(),
  workspaceId: z.string(),
  folderId: z.string().nullable(),
})

const listWebhooksWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "GET",
    path: "/v1/webhooks",
    summary: "List webhooks",
    tags: ["Webhooks"],
  })
  .output(z.object({ data: z.array(webhookResource) }))
  .errors(possibleErrorsOnListingResource)
  .handler(async ({ context }) => {
    const data = await webhookService.listByWorkspaceId(context.workspace.id)
    return { data }
  })

const createWebhookWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "POST",
    path: "/v1/webhooks",
    summary: "Register a webhook",
    description:
      "Registers a URL to receive system events (e.g. new contact, tag applied). Automation platforms (e.g. n8n) can call this to auto-attach a webhook when a workflow is activated.",
    successStatus: 201,
    tags: ["Webhooks"],
  })
  .input(
    z.object({
      name: z.string().trim().min(1).max(255),
      url: z.string().trim().url().max(1000),
      conditions: z.array(conditionSchema).min(1),
    }),
  )
  .output(webhookResource)
  .errors(possibleErrorsOnCreatingResource)
  .handler(async ({ context, input }) => {
    const { name, url, conditions } = input

    return await webhookService.register({
      workspaceId: context.workspace.id,
      name,
      url,
      conditions: conditions.map(toConditionColumns),
    })
  })

const deleteWebhookWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "DELETE",
    path: "/v1/webhooks/{id}",
    summary: "Unregister a webhook",
    successStatus: 204,
    tags: ["Webhooks"],
  })
  .input(z.object({ id: zodBigintAsString() }))
  .errors(possibleErrorsOnDeletingResource)
  .handler(async ({ context, input }) => {
    await webhookService.unregister({
      workspaceId: context.workspace.id,
      id: input.id,
    })
  })

export const webhooksWorkspaceTokenAPIs = {
  listWebhooksWorkspaceTokenAPI,
  createWebhookWorkspaceTokenAPI,
  deleteWebhookWorkspaceTokenAPI,
}

export default webhooksWorkspaceTokenAPIs
