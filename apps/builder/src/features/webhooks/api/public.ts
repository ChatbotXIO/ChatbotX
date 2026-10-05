import { webhookService } from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import { createSelectSchema, webhookModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { bulkUpdateIdsRequest } from "@/features/common/schema"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { publicListRequest, publicListResponse } from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"

import { conditionSchema } from "../../conditions/schema"
import { publicWebhookResource } from "../schema/resource"
import { updateWebhookSettingsRequest } from "../schema/update-webhook-schema"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("integrations")

const webhookResource = createSelectSchema(webhookModel, {
  id: z.string(),
  workspaceId: z.string(),
  folderId: z.string().nullable(),
})

const webhookIdSchema = zodBigintAsString().describe(
  "Webhook id. Get it from `webhooks.list`.",
)

// Same loose row shape as `triggerResource`'s conditions: `value` varies per
// condition `type`, and this is a read-only resource.
const webhookConditionResource = z.object({
  id: z.string(),
  type: z.string(),
  sourceId: z.string().nullable(),
  operator: z.string().nullable(),
  value: z.unknown(),
})

const webhookWithConditionsResource = publicWebhookResource.extend({
  conditions: z.array(webhookConditionResource),
})

const findWebhookResource = async (workspaceId: string, id: string) =>
  webhookWithConditionsResource.parse(
    await webhookService.findWithConditionsOrFail({ workspaceId, id }),
  )

export const webhooksPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/webhooks",
      summary: "List webhooks",
      description:
        "Use this to find registered webhook ids before inspecting one with `webhooks.get` or removing one with `webhooks.delete`. Returns webhooks registered in this workspace.",
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

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/webhooks/{id}",
      summary: "Get webhook",
      description:
        "Returns one webhook's URL, active state and the event conditions that fire it. Use `webhooks.list` to find its id first.",
      tags: ["Webhooks"],
    })
    .input(z.object({ id: webhookIdSchema }))
    .output(webhookWithConditionsResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await findWebhookResource(context.workspace.id, input.id),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/webhooks/{id}",
      summary: "Replace webhook URL and conditions",
      description:
        "Overwrites a webhook's target URL and its full set of event conditions; a condition sent with its `id` is kept and updated, one left out is removed. Call `webhooks.get` to inspect current values first.",
      tags: ["Webhooks"],
    })
    .input(
      z.object({
        id: webhookIdSchema,
        url: z
          .string()
          .trim()
          .url()
          .max(1000)
          .describe(
            "URL to receive HTTP POST requests when a matching event occurs. Must be a public address.",
          ),
        conditions: z
          .array(conditionSchema)
          .min(1)
          .describe("Event conditions that trigger this webhook."),
      }),
    )
    .output(webhookWithConditionsResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const updated = await webhookService.updateWithConditions({
        workspaceId,
        id: input.id,
        url: input.url,
        conditions: input.conditions,
      })
      if (!updated) {
        throw notFoundException("Webhook not found")
      }
      return await findWebhookResource(workspaceId, input.id)
    }),

  updateSettings: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/webhooks/{id}/settings",
      summary: "Update webhook name or active state",
      description:
        "Renames a webhook or turns its deliveries on/off without touching its URL and conditions. Use `webhooks.update` to change those instead.",
      tags: ["Webhooks"],
    })
    .input(
      updateWebhookSettingsRequest.extend({
        id: webhookIdSchema,
        name: updateWebhookSettingsRequest.shape.name.describe(
          "New webhook name.",
        ),
        active: updateWebhookSettingsRequest.shape.active.describe(
          "Whether the webhook receives events.",
        ),
      }),
    )
    .output(webhookWithConditionsResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...patch } = input
      const workspaceId = context.workspace.id
      await webhookService.updateSettings({ workspaceId, id, ...patch })
      return await findWebhookResource(workspaceId, id)
    }),

  deleteMany: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/webhooks/bulk-delete",
      summary: "Unregister multiple webhooks",
      description:
        "Permanently deletes several webhooks in one call; ids outside this workspace are ignored. Use `webhooks.list` to find their ids first.",
      successStatus: 204,
      tags: ["Webhooks"],
    })
    .input(bulkUpdateIdsRequest)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await webhookService.deleteMany({
        workspaceId: context.workspace.id,
        ids: input.ids,
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
    .input(z.object({ id: webhookIdSchema }))
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await webhookService.unregister({
        workspaceId: context.workspace.id,
        id: input.id,
      })
    }),
}
