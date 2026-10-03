import { webhookService } from "@chatbotx.io/business"
import { createSelectSchema, webhookModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnListingResource,
} from "@/lib/orpc/orpc-error-helper"
import { publicListRequest, publicListResponse } from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"

import { conditionSchema } from "../../conditions/schema"
import { publicWebhookResource } from "../schema/resource"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("integrations")

const webhookResource = createSelectSchema(webhookModel, {
  id: z.string(),
  workspaceId: z.string(),
  folderId: z.string().nullable(),
})

export const webhooksPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/webhooks",
      summary: "List webhooks",
      description:
        "Use this to find registered webhook ids before removing one with `webhooks.delete`. Returns webhooks registered in this workspace.",
      tags: ["Webhooks"],
    })
    .input(publicListRequest)
    .output(publicListResponse(publicWebhookResource))
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await webhookService.list({
          workspaceId: context.workspace.id,
          page: input.page,
          perPage: input.perPage,
        }),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/webhooks",
      summary: "Register webhook",
      description:
        "Registers a URL to receive system events (e.g. new contact, tag applied). Automation platforms (e.g. n8n) can call this to auto-attach a webhook when a workflow is activated.",
      successStatus: 201,
      tags: ["Webhooks"],
    })
    .input(
      z.object({
        name: z.string().trim().min(1).max(255).describe("Webhook name."),
        url: z
          .string()
          .trim()
          .url()
          .max(1000)
          .describe(
            "URL to receive HTTP POST requests when a matching event occurs.",
          ),
        conditions: z
          .array(conditionSchema)
          .min(1)
          .describe("Event conditions that trigger this webhook."),
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
        conditions,
      })
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/webhooks/{id}",
      summary: "Unregister webhook",
      description:
        "Permanently deletes a registered webhook. Use `webhooks.list` to find its id first.",
      successStatus: 204,
      tags: ["Webhooks"],
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "Webhook id. Get it from `webhooks.list`.",
        ),
      }),
    )
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await webhookService.unregister({
        workspaceId: context.workspace.id,
        id: input.id,
      })
    }),
}
