import {
  describeTemplateParameters,
  integrationMetaCatalogService,
  integrationWhatsappService,
  whatsappMessageTemplateService,
} from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { templateParametersField } from "@/lib/public-api/template-parameters"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { syncWhatsappMessageTemplates } from "../lib/sync-whatsapp-templates"
import {
  listWhatsappMessageTemplatesRequest,
  listWhatsappMessageTemplatesResponse,
  searchMetaCatalogProductsRequest,
  searchMetaCatalogProductsResponse,
} from "../schema/query"
import { whatsappMessageTemplateResource } from "../schema/resource"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("broadcasts")

export const whatsappTemplatesPublicRouter = {
  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/whatsapp/templates/{id}",
      summary: "Get WhatsApp template",
      description:
        "Returns one WhatsApp message template with its components, approval status and `parameters`: the keys to fill in `templateParams` when sending it. Find its id with `whatsappTemplates.list`.",
      tags: ["WhatsApp Templates"],
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "Template id. Get it from `whatsappTemplates.list`.",
        ),
      }),
    )
    .output(
      whatsappMessageTemplateResource.extend({
        parameters: templateParametersField,
      }),
    )
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const template =
        await whatsappMessageTemplateService.findByIdForWorkspace({
          id: input.id,
          workspaceId: context.workspace.id,
        })
      if (!template) {
        throw notFoundException("Template not found")
      }
      return {
        ...template,
        parameters: describeTemplateParameters({
          channel: "whatsapp",
          components: template.components,
        }),
      }
    }),

  sync: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/whatsapp-channels/{id}/templates/sync",
      summary: "Sync WhatsApp templates",
      description:
        "Pulls the number's message templates and their approval status from Meta into this workspace. Run it after creating or editing a template on Meta, or to refresh a PENDING status. Then read the result with `whatsappTemplates.list`.",
      successStatus: 204,
      tags: ["WhatsApp Templates"],
    })
    .input(
      z.object({
        id: zodBigintAsString().describe(
          "WhatsApp channel (integration) id. Get it from `whatsappChannels.list`.",
        ),
      }),
    )
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const integrationWhatsapp =
        await integrationWhatsappService.findByIdForWorkspace({
          id: input.id,
          workspaceId,
        })
      if (!integrationWhatsapp) {
        throw notFoundException("WhatsApp channel not found")
      }
      await syncWhatsappMessageTemplates({ workspaceId, integrationWhatsapp })
    }),

  searchCatalogProducts: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/whatsapp/templates/catalog-products",
      summary: "Search Meta Catalog products for templates",
      description:
        "Searches the workspace's connected Meta Catalog by name so you can pick a `retailerId` for a template's product button when sending. `connected` is false when no catalog is connected.",
      tags: ["WhatsApp Templates"],
    })
    .input(searchMetaCatalogProductsRequest.omit({ workspaceId: true }))
    .output(searchMetaCatalogProductsResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await integrationMetaCatalogService.searchProductsForSend({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/whatsapp/templates",
      summary: "List WhatsApp templates",
      description:
        "Returns WhatsApp message templates approved for use in broadcasts, along with their approval status.",
      tags: ["WhatsApp Templates"],
    })
    .input(
      listWhatsappMessageTemplatesRequest.omit({
        workspaceId: true,
      }),
    )
    .output(listWhatsappMessageTemplatesResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await whatsappMessageTemplateService.list({
          where: { ...input, workspaceId: context.workspace.id },
        }),
    ),
}

// Deprecated — use `whatsappTemplates.list` instead. Kept for backward
// compatibility with the pre-consolidation `/v1/template-messages` path and
// `templateMessages.list` operation name; hidden from MCP/CLI tool listings.
export const templateMessagesPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/template-messages",
      summary: "List template messages",
      description:
        "Deprecated — renamed to `whatsappTemplates.list` at `/v1/whatsapp/templates`; this route returns the same data, kept only for callers still on the old path.",
      deprecated: true,
      tags: ["Template Messages"],
    })
    .input(
      listWhatsappMessageTemplatesRequest.omit({
        workspaceId: true,
      }),
    )
    .output(listWhatsappMessageTemplatesResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await whatsappMessageTemplateService.list({
          where: { ...input, workspaceId: context.workspace.id },
        }),
    ),
}
