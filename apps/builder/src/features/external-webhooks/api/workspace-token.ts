import { externalWebhookService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnListingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPI } from "@/orpc"

const externalWebhookResource = z.object({
  id: z.string(),
  provider: z.string(),
  event: z.string(),
  url: z.string(),
})

const listExternalWebhooksWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "GET",
    path: "/v1/external-webhooks",
    summary: "List external webhooks",
    description:
      "List webhooks registered by external automation platforms (e.g. Make) for this workspace.",
    tags: ["External Webhooks"],
  })
  .output(z.object({ data: z.array(externalWebhookResource) }))
  .errors(possibleErrorsOnListingResource)
  .handler(async ({ context }) => {
    const data = await externalWebhookService.listByWorkspaceId(
      context.workspace.id,
    )
    return { data }
  })

const createExternalWebhookWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "POST",
    path: "/v1/external-webhooks",
    summary: "Register an external webhook",
    description:
      "Registers a URL to receive events for a given event name. Idempotent — registering the same (event, url) again returns the existing registration.",
    successStatus: 201,
    tags: ["External Webhooks"],
  })
  .input(
    z.object({
      url: z.string().trim().url(),
      event: z.string().trim().min(1).max(100),
      provider: z.enum(["make", "n8n"]).default("make"),
    }),
  )
  .output(externalWebhookResource)
  .errors(possibleErrorsOnCreatingResource)
  .handler(
    async ({ context, input }) =>
      await externalWebhookService.register({
        workspaceId: context.workspace.id,
        provider: input.provider,
        event: input.event,
        url: input.url,
      }),
  )

const deleteExternalWebhookWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "DELETE",
    path: "/v1/external-webhooks/{id}",
    summary: "Unregister an external webhook",
    successStatus: 204,
    tags: ["External Webhooks"],
  })
  .input(z.object({ id: zodBigintAsString() }))
  .errors(possibleErrorsOnDeletingResource)
  .handler(async ({ context, input }) => {
    await externalWebhookService.unregister({
      workspaceId: context.workspace.id,
      id: input.id,
    })
  })

export const externalWebhooksWorkspaceTokenAPIs = {
  listExternalWebhooksWorkspaceTokenAPI,
  createExternalWebhookWorkspaceTokenAPI,
  deleteExternalWebhookWorkspaceTokenAPI,
}

export default externalWebhooksWorkspaceTokenAPIs
