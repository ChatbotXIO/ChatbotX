import {
  messengerIntegrationService,
  messengerMessageTemplateService,
} from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  cloneMessengerMessageTemplate,
  createMessengerMessageTemplate,
  invalidateMessengerTemplatesCache,
  syncMessengerMessageTemplatesForIntegration,
} from "../lib/message-template-operations"
import { createMessengerMessageTemplateRequest } from "../schema/mutation"
import {
  listMessengerMessageTemplatesRequest,
  listMessengerMessageTemplatesResponse,
} from "../schema/query"
import { messengerMessageTemplateResource } from "../schema/resource"

// Same scope as the WhatsApp template routes: both are the templates a
// broadcast can send.
const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("broadcasts")

const templateIdParam = z.object({
  id: zodBigintAsString().describe(
    "Template id. Get it from `messengerTemplates.list`.",
  ),
})

const channelIdParam = z.object({
  id: zodBigintAsString().describe(
    "Messenger channel (integration) id. Get it from `messengerChannels.list`.",
  ),
})

const createdTemplateResponse = z.object({
  id: z.string().describe("Meta's id of the new template."),
  status: z
    .string()
    .describe("`APPROVED`, `PENDING` or `REJECTED` as reported by Meta."),
  rejectionReason: z
    .string()
    .nullable()
    .describe("Meta's rejection reason when the template was rejected."),
  specificRejectionReason: z
    .string()
    .nullable()
    .describe("Meta's more specific rejection reason, when given."),
})

const cloneTemplateRequest = z
  .object({
    targetIntegrationMessengerIds: z
      .array(zodBigintAsString())
      .min(1)
      .max(20)
      .describe(
        "Messenger channels of this workspace to copy the template onto. The template's own Page is skipped.",
      ),
  })
  .and(templateIdParam)

const cloneTemplateResponse = z.object({
  succeeded: z.array(z.object({ channel: z.string() })),
  failed: z.array(z.object({ channel: z.string(), error: z.string() })),
})

export const messengerTemplatesPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/messenger/templates",
      summary: "List Messenger templates",
      description:
        "Lists the Messenger message templates synced from Meta for this workspace's Pages, with their approval status. Filter by `integrationMessengerId`, `inboxId` or `status`. Use `messengerTemplates.sync` first if a template just created on Meta is missing.",
      tags: ["Messenger Templates"],
    })
    .input(
      // The service lists every template (the builder paginates separately).
      listMessengerMessageTemplatesRequest.omit({
        workspaceId: true,
        page: true,
        perPage: true,
        name: true,
      }),
    )
    .output(listMessengerMessageTemplatesResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await messengerMessageTemplateService.list({
          where: { ...input, workspaceId: context.workspace.id },
        }),
    ),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/messenger/templates/{id}",
      summary: "Get Messenger template",
      description:
        "Returns one Messenger message template with its components and status. Find its id with `messengerTemplates.list`.",
      tags: ["Messenger Templates"],
    })
    .input(templateIdParam)
    .output(messengerMessageTemplateResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const template =
        await messengerMessageTemplateService.findByIdForWorkspace({
          id: input.id,
          workspaceId: context.workspace.id,
        })
      if (!template) {
        throw notFoundException("Template not found")
      }
      return template
    }),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/messenger-channels/{id}/templates",
      summary: "Create Messenger template",
      description:
        "Creates a utility message template on a Messenger Page (it is submitted to Meta for approval) and mirrors it locally. A template Meta rejects is still created: check `status` and `rejectionReason`. A `text_and_image` header downloads `headerImageUrl` from a public address.",
      successStatus: 201,
      tags: ["Messenger Templates"],
    })
    .input(createMessengerMessageTemplateRequest.and(channelIdParam))
    .output(createdTemplateResponse)
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...request } = input
      const workspaceId = context.workspace.id
      const integrationMessenger =
        await messengerIntegrationService.findByIdForWorkspace({
          id,
          workspaceId,
        })
      if (!integrationMessenger) {
        throw notFoundException("Messenger channel not found")
      }
      const created = await createMessengerMessageTemplate({
        workspaceId,
        integrationMessenger,
        request,
      })
      return {
        id: created.id,
        status: created.status,
        rejectionReason: created.rejectionReason ?? null,
        specificRejectionReason: created.specificRejectionReason ?? null,
      }
    }),

  clone: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/messenger/templates/{id}/clone",
      summary: "Clone Messenger template",
      description:
        "Creates the template on other Messenger channels of this workspace (never on its own Page, and never on another workspace). Each target is reported in `succeeded` or `failed`; an image header is re-uploaded to each target Page. A template Meta leaves pending is reported as failed with its status and is not synced until it is approved: run `messengerTemplates.sync` later.",
      tags: ["Messenger Templates"],
    })
    .input(cloneTemplateRequest)
    .output(cloneTemplateResponse)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const source = await messengerMessageTemplateService.findByIdForWorkspace(
        { id: input.id, workspaceId },
      )
      if (!source) {
        throw notFoundException("Template not found")
      }
      const requested = new Set(input.targetIntegrationMessengerIds)
      const pages = await messengerIntegrationService.listByWorkspaceIdOrId({
        workspaceId,
      })
      const targets = pages.filter(
        (page) =>
          requested.has(page.id) &&
          page.pageId !== source.integrationMessenger.pageId,
      )
      if (targets.length === 0) {
        throw notFoundException("No target channels found in this workspace")
      }
      return await cloneMessengerMessageTemplate({
        sourceWorkspaceId: workspaceId,
        sourceTemplate: source,
        targets,
      })
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/messenger/templates/{id}",
      summary: "Delete Messenger template",
      description:
        "Removes the template from this workspace's local list only. Meta keeps the template, and `messengerTemplates.sync` brings it back.",
      successStatus: 204,
      tags: ["Messenger Templates"],
    })
    .input(templateIdParam)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const template =
        await messengerMessageTemplateService.findByIdForWorkspace({
          id: input.id,
          workspaceId,
        })
      if (!template) {
        throw notFoundException("Template not found")
      }
      await messengerMessageTemplateService.delete({
        id: template.id,
        integrationMessengerId: template.integrationMessengerId,
      })
      await invalidateMessengerTemplatesCache([workspaceId])
    }),

  sync: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/messenger-channels/{id}/templates/sync",
      summary: "Sync Messenger templates",
      description:
        "Pulls the Page's message templates and their approval status from Meta into this workspace. Run it after creating or editing a template on Meta, or to refresh a `PENDING` status.",
      successStatus: 204,
      tags: ["Messenger Templates"],
    })
    .input(channelIdParam)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const integrationMessenger =
        await messengerIntegrationService.findByIdForWorkspace({
          id: input.id,
          workspaceId,
        })
      if (!integrationMessenger) {
        throw notFoundException("Messenger channel not found")
      }
      await syncMessengerMessageTemplatesForIntegration({
        workspaceId,
        integrationMessenger,
      })
      await invalidateMessengerTemplatesCache([workspaceId])
    }),
}
