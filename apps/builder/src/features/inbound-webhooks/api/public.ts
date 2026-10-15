import {
  inboundWebhookService,
  resolveTenantSettings,
} from "@chatbotx.io/business"
import {
  inboundWebhookFieldMappingsSchema,
  inboundWebhookIdentifiersSchema,
  inboundWebhookInboxResolutionSchema,
  inboundWebhookRequestStatuses,
} from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { bulkUpdateIdsRequest } from "@/features/common/schema"
import { mcpSpec } from "@/lib/orpc/mcp-annotations"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { publicListRequest } from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { buildInboundWebhookUrl } from "../lib/endpoint-url"
import {
  createInboundWebhookRequest,
  inboundWebhookConfigRequest,
  inboundWebhookPreviewPayloadSchema,
  updateInboundWebhookSettingsRequest,
} from "../schema/action"
import {
  inboundWebhookChannelResource,
  inboundWebhookIdSchema,
  inboundWebhookRequestDetailResource,
  inboundWebhookResource,
  listInboundWebhookChannels,
  listInboundWebhookRequestsPublicResponse,
  listInboundWebhooksPublicResponse,
  previewMappingResource,
  regeneratedTokenResource,
  toInboundWebhookRequestDetail,
  toInboundWebhookRequestSummary,
  toInboundWebhookResource,
  toInboundWebhookSummary,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("integrations")

/** Served on the tenant's own app URL, like magic links, so a white-label URL stays on-brand. */
const endpointUrlFor = async (workspaceId: string, token: string) => {
  const { appUrl } = await resolveTenantSettings({ workspaceId })
  return buildInboundWebhookUrl({ origin: appUrl, token })
}

const readOnly = mcpSpec({ readOnlyHint: true })

const flowIdsNote =
  "Get flow ids from `flows.list`, inbox ids and their `sourceId` (page id, phone number id, …) from `inboxes.list`, and custom field ids from `customFields.list`."

export const inboundWebhooksPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/inbound-webhooks",
      summary: "List inbound webhooks",
      description:
        "Use this to find inbound webhook ids before reading one with `inboundWebhooks.get`. Returns the webhooks of this workspace without their secret URLs.",
      spec: readOnly,
      tags: ["Inbound Webhooks"],
    })
    .input(publicListRequest)
    .output(listInboundWebhooksPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const { data, pageCount } = await inboundWebhookService.list({
        workspaceId: context.workspace.id,
        page: input.page,
        perPage: input.perPage,
      })
      return { data: data.map(toInboundWebhookSummary), pageCount }
    }),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/inbound-webhooks",
      summary: "Create inbound webhook",
      description:
        "Creates an inactive inbound webhook and returns its secret endpoint URL. External systems POST JSON to that URL to find or create a contact, save values on it and run actions. Configure it with `inboundWebhooks.update`, then activate it with `inboundWebhooks.updateSettings`.",
      successStatus: 201,
      tags: ["Inbound Webhooks"],
    })
    .input(createInboundWebhookRequest)
    .output(inboundWebhookResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const webhook = await inboundWebhookService.create({
        workspaceId,
        name: input.name,
      })
      return toInboundWebhookResource(
        webhook,
        await endpointUrlFor(workspaceId, webhook.token),
      )
    }),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/inbound-webhooks/{id}",
      summary: "Get inbound webhook",
      description:
        "Returns one inbound webhook with its full configuration and, for full-access tokens, its secret endpoint URL. Use `inboundWebhooks.list` to find its id first.",
      spec: readOnly,
      tags: ["Inbound Webhooks"],
    })
    .input(z.object({ id: inboundWebhookIdSchema }))
    .output(inboundWebhookResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const webhook = await inboundWebhookService.findOrFail({
        workspaceId,
        id: input.id,
      })
      // The URL is a credential that runs the webhook's actions, so a
      // read-only token never receives it.
      return toInboundWebhookResource(
        webhook,
        context.apiToken?.permission === "read_only"
          ? undefined
          : await endpointUrlFor(workspaceId, webhook.token),
      )
    }),

  update: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/inbound-webhooks/{id}",
      summary: "Replace inbound webhook configuration",
      description: `Overwrites the whole configuration: which inbox the contact belongs to, how the contact is identified, which payload values are saved and which actions run. Read the channel rules with \`inboundWebhookChannels.list\` and try a payload with \`inboundWebhooks.previewMapping\` first. The configuration must be complete: an inbox rule, at least one contact identifier and at least one field mapping. JSON paths are stored in the \`$\` form (\`$.customer.email\`). ${flowIdsNote}`,
      tags: ["Inbound Webhooks"],
    })
    .input(inboundWebhookConfigRequest.extend({ id: inboundWebhookIdSchema }))
    .output(inboundWebhookResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const { id, sampleJson, ...config } = input
      const webhook = await inboundWebhookService.update({
        workspaceId,
        id,
        ...config,
        sampleJson: sampleJson ?? null,
      })
      return toInboundWebhookResource(
        webhook,
        await endpointUrlFor(workspaceId, webhook.token),
      )
    }),

  updateSettings: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/inbound-webhooks/{id}/settings",
      summary: "Update inbound webhook name or active state",
      description:
        "Renames a webhook or turns its intake on or off without touching its configuration. Activating requires a complete configuration (an inbox, at least one contact identifier and at least one field mapping). Use `inboundWebhooks.update` to change the configuration.",
      tags: ["Inbound Webhooks"],
    })
    .input(
      updateInboundWebhookSettingsRequest.extend({
        id: inboundWebhookIdSchema,
      }),
    )
    .output(inboundWebhookResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const webhook = await inboundWebhookService.updateSettings({
        workspaceId,
        ...input,
      })
      return toInboundWebhookResource(
        webhook,
        await endpointUrlFor(workspaceId, webhook.token),
      )
    }),

  regenerateToken: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/inbound-webhooks/{id}/regenerate-token",
      summary: "Regenerate inbound webhook URL",
      description:
        "Replaces the secret in the endpoint URL. The previous URL stops working within 10 seconds, so update every system that posts to it. Use `inboundWebhooks.list` to find the id.",
      tags: ["Inbound Webhooks"],
    })
    .input(z.object({ id: inboundWebhookIdSchema }))
    .output(regeneratedTokenResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const webhook = await inboundWebhookService.regenerateToken({
        workspaceId,
        id: input.id,
      })
      return { endpointUrl: await endpointUrlFor(workspaceId, webhook.token) }
    }),

  previewMapping: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/inbound-webhooks/preview-mapping",
      summary: "Preview inbound webhook mapping",
      description:
        "Shows what a delivery of a sample payload would do with a configuration — the inbox identifier, the contact identities, which one the contact would be searched by (`contactLookup`) and every mapped value with its verdict — without saving anything or touching any contact. Uses the same extraction as the real delivery.",
      spec: readOnly,
      tags: ["Inbound Webhooks"],
    })
    .input(
      z.object({
        payload: inboundWebhookPreviewPayloadSchema.describe(
          "The JSON body an external system would send.",
        ),
        inboxResolution: inboundWebhookInboxResolutionSchema
          .nullable()
          .describe(
            "Inbox choice to preview, as in `inboundWebhooks.update`; its path is read from the payload.",
          ),
        identifiers: inboundWebhookIdentifiersSchema.describe(
          "Contact identifier paths to preview, as in `inboundWebhooks.update`.",
        ),
        fieldMappings: inboundWebhookFieldMappingsSchema.describe(
          "Field mappings to preview, as in `inboundWebhooks.update`.",
        ),
      }),
    )
    .output(previewMappingResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await inboundWebhookService.previewMapping({
          workspaceId: context.workspace.id,
          ...input,
        }),
    ),

  listRequests: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/inbound-webhooks/{id}/requests",
      summary: "List inbound webhook requests",
      description:
        "The deliveries this webhook received, newest first, with their outcome (`processed`, `completedWithErrors`, `skipped`, `failed`) and why. Kept 30 days. Use `inboundWebhooks.getRequest` for the details of one.",
      spec: readOnly,
      tags: ["Inbound Webhooks"],
    })
    .input(
      publicListRequest.extend({
        id: inboundWebhookIdSchema,
        status: inboundWebhookRequestStatuses
          .optional()
          .describe("Only requests in this status."),
      }),
    )
    .output(listInboundWebhookRequestsPublicResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      await inboundWebhookService.findOrFail({ workspaceId, id: input.id })
      const { data, pageCount } = await inboundWebhookService.listRequests({
        workspaceId,
        inboundWebhookId: input.id,
        status: input.status,
        page: input.page,
        perPage: input.perPage,
      })
      return { data: data.map(toInboundWebhookRequestSummary), pageCount }
    }),

  getRequest: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/inbound-webhooks/{id}/requests/{requestId}",
      summary: "Get inbound webhook request",
      description:
        "One delivery with the rejected field values and the result of each action. The payload can hold personal data, so it is only returned when `includePayload` is `true`. Find request ids with `inboundWebhooks.listRequests`.",
      spec: readOnly,
      tags: ["Inbound Webhooks"],
    })
    .input(
      z.object({
        id: inboundWebhookIdSchema,
        requestId: zodBigintAsString().describe(
          "Request id. Get it from `inboundWebhooks.listRequests`.",
        ),
        includePayload: z
          .enum(["true", "false"])
          .default("false")
          .describe("Return the original request body too."),
      }),
    )
    .output(inboundWebhookRequestDetailResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) =>
      toInboundWebhookRequestDetail(
        await inboundWebhookService.findRequestOrFail({
          workspaceId: context.workspace.id,
          inboundWebhookId: input.id,
          id: input.requestId,
        }),
        input.includePayload === "true",
      ),
    ),

  deleteMany: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/inbound-webhooks/bulk-delete",
      summary: "Delete multiple inbound webhooks",
      description:
        "Permanently deletes several inbound webhooks and their request history in one call; ids outside this workspace are ignored. Use `inboundWebhooks.list` to find their ids first.",
      spec: mcpSpec({ destructiveHint: true }),
      successStatus: 204,
      tags: ["Inbound Webhooks"],
    })
    .input(bulkUpdateIdsRequest)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await inboundWebhookService.deleteMany({
        workspaceId: context.workspace.id,
        ids: input.ids,
      })
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/inbound-webhooks/{id}",
      summary: "Delete inbound webhook",
      description:
        "Permanently deletes an inbound webhook and its request history; its URL stops working. Use `inboundWebhooks.list` to find the id first.",
      successStatus: 204,
      tags: ["Inbound Webhooks"],
    })
    .input(z.object({ id: inboundWebhookIdSchema }))
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await inboundWebhookService.delete({
        workspaceId: context.workspace.id,
        id: input.id,
      })
    }),
}

export const inboundWebhookChannelsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/inbound-webhook-channels",
      summary: "List inbound webhook channel rules",
      description:
        "For every channel: whether the inbox can be chosen from a value in the payload, which inbox identifiers it accepts (Messenger page id, WhatsApp phone number id or display phone, Instagram account id, …), whether it has its own contact id (PSID, IGSID, Telegram chat id, …) and which identities can create a contact (any identity can find one). Use it to author a valid `inboundWebhooks.update` configuration.",
      spec: readOnly,
      tags: ["Inbound Webhooks"],
    })
    .output(z.array(inboundWebhookChannelResource))
    .errors(possibleErrorsOnListingResource)
    .handler(() => listInboundWebhookChannels()),
}
