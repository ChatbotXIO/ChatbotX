import {
  importMiniAppFlowJson,
  miniAppService,
  miniAppSubmissionService,
} from "@chatbotx.io/business/mini-app"
import type {
  MiniAppModel,
  MiniAppPublicationModel,
} from "@chatbotx.io/database/types"
import {
  applyCustomFieldMappings,
  collectCustomFieldMappings,
  locateIssues,
  validateMiniApp,
} from "@chatbotx.io/mini-app"
import { z } from "zod"
import { mcpSpec } from "@/lib/orpc/mcp-annotations"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
  possibleIdempotencyErrors,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { buildMiniAppPublicUrl } from "../lib/public-url"
import { publishMiniAppToWhatsapp } from "../lib/publish-to-whatsapp"
import {
  createMiniAppPublicRequest,
  listMiniAppSubmissionsPublicRequest,
  listMiniAppSubmissionsPublicResponse,
  listMiniAppsPublicRequest,
  listMiniAppsPublicResponse,
  miniAppIdPublicRequest,
  miniAppPublicResource,
  miniAppValidationPublicResponse,
  publishMiniAppPublicRequest,
  updateMiniAppPublicRequest,
  validateMiniAppPublicRequest,
} from "../schema/public"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("mini-apps")

const tags = ["Mini Apps"]

const toSummary = (
  miniApp: Pick<
    MiniAppModel,
    "id" | "name" | "enabled" | "submissionsCount" | "createdAt" | "updatedAt"
  >,
) => ({
  id: miniApp.id,
  name: miniApp.name,
  enabled: miniApp.enabled,
  submissionsCount: miniApp.submissionsCount,
  createdAt: miniApp.createdAt,
  updatedAt: miniApp.updatedAt,
  publicUrl: buildMiniAppPublicUrl(miniApp.id),
})

const toValidation = (definition: MiniAppModel["definition"]) => {
  const result = validateMiniApp(definition)
  return {
    valid: result.valid,
    issues: locateIssues(definition, result.issues),
  }
}

/**
 * A new Flow JSON drops editor-only data, so existing custom field mappings
 * are carried over by input name before `customFieldMappings` is applied.
 */
const buildUpdatedDefinition = (
  current: MiniAppModel["definition"],
  input: {
    flowJson?: Parameters<typeof importMiniAppFlowJson>[0]
    customFieldMappings?: Record<string, string | null>
  },
) => {
  if (!(input.flowJson || input.customFieldMappings)) {
    return
  }
  const base = input.flowJson ? importMiniAppFlowJson(input.flowJson) : current
  return applyCustomFieldMappings(base, {
    ...(input.flowJson ? collectCustomFieldMappings(current) : {}),
    ...input.customFieldMappings,
  })
}

const toDetail = (
  miniApp: MiniAppModel & { publications?: MiniAppPublicationModel[] },
) => ({
  ...toSummary(miniApp),
  flowJson: miniApp.flowJson as unknown as Record<string, unknown>,
  customFieldMappings: collectCustomFieldMappings(miniApp.definition),
  validation: toValidation(miniApp.definition),
  publications: (miniApp.publications ?? []).map((publication) => ({
    integrationWhatsappId: publication.integrationWhatsappId,
    status: publication.status,
    whatsappFlowId: publication.whatsappFlowId,
    publishedAt: publication.publishedAt,
  })),
})

export const miniAppsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/mini-apps",
      summary: "List Mini Apps",
      description:
        "Lists the workspace's Mini Apps (WhatsApp Flow forms) with their public link. Use `miniApps.get` for the Flow JSON. Returns `{ data, pageCount }`; page with `page`/`perPage`.",
      tags,
      spec: mcpSpec({ visibility: "default" }),
    })
    .input(listMiniAppsPublicRequest)
    .output(listMiniAppsPublicResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const result = await miniAppService.list({
        workspaceId: context.workspace.id,
        keyword: input.name,
        page: input.page,
        perPage: input.perPage,
        sort: [{ id: "createdAt", desc: true }],
      })
      return { data: result.data.map(toSummary), pageCount: result.pageCount }
    }),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/mini-apps/{id}",
      summary: "Get Mini App",
      description:
        "Returns one Mini App as WhatsApp Flow JSON 7.3, its validation issues, public link and WhatsApp publications. Find the id with `miniApps.list`.",
      tags,
    })
    .input(miniAppIdPublicRequest)
    .output(miniAppPublicResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) =>
      toDetail(
        await miniAppService.findOrFail({
          workspaceId: context.workspace.id,
          id: input.id,
        }),
      ),
    ),

  validate: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/mini-apps/validate",
      summary: "Validate Mini App Flow JSON",
      description:
        "Checks a WhatsApp Flow JSON against Meta's rules (character limits, one Footer per screen, navigation targets, If/Switch nesting, ...) without saving it. Fix every `error` before `miniApps.publishWhatsapp`.",
      tags,
      spec: mcpSpec({ readOnlyHint: true }),
    })
    .input(validateMiniAppPublicRequest)
    .output(miniAppValidationPublicResponse)
    .errors({
      ...possibleErrorsOnListingResource,
      ...possibleIdempotencyErrors,
    })
    .handler(({ input }) =>
      toValidation(importMiniAppFlowJson(input.flowJson)),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/mini-apps",
      summary: "Create Mini App",
      description:
        "Creates a Mini App from WhatsApp Flow JSON. It is saved even with validation issues (returned in `validation`) so it can be fixed later; its `publicUrl` works on any channel. Use `miniApps.validate` first to check the JSON.",
      successStatus: 201,
      tags,
      spec: mcpSpec({ visibility: "default" }),
    })
    .input(createMiniAppPublicRequest)
    .output(miniAppPublicResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) => {
      const created = await miniAppService.create({
        workspaceId: context.workspace.id,
        name: input.name,
        definition: applyCustomFieldMappings(
          importMiniAppFlowJson(input.flowJson),
          input.customFieldMappings ?? {},
        ),
      })
      return toDetail(created)
    }),

  update: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/mini-apps/{id}",
      summary: "Update Mini App",
      description:
        "Changes a Mini App's name, enabled state and/or Flow JSON (a new `flowJson` replaces the whole app). A published WhatsApp Flow is not changed until `miniApps.publishWhatsapp` runs again.",
      tags,
    })
    .input(updateMiniAppPublicRequest)
    .output(miniAppPublicResource)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const ctx = { workspaceId: context.workspace.id, id: input.id }
      const current = await miniAppService.findOrFail(ctx)
      await miniAppService.update(ctx, {
        name: input.name,
        enabled: input.enabled,
        definition: buildUpdatedDefinition(current.definition, input),
      })
      return toDetail(await miniAppService.findOrFail(ctx))
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/mini-apps/{id}",
      summary: "Delete Mini App",
      description:
        "Permanently deletes a Mini App and its answers. Flows already published to WhatsApp stay on Meta. Find the id with `miniApps.list`.",
      successStatus: 204,
      tags,
    })
    .input(miniAppIdPublicRequest)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await miniAppService.findOrFail({
        workspaceId: context.workspace.id,
        id: input.id,
      })
      await miniAppService.deleteMany({
        workspaceId: context.workspace.id,
        ids: [input.id],
      })
    }),

  publishWhatsapp: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/mini-apps/{id}/publish-whatsapp",
      summary: "Publish Mini App to WhatsApp",
      description:
        "Creates or updates the Mini App as a WhatsApp Flow on one WhatsApp number and publishes it. The Flow then appears in `whatsappFlows.list` for Send WhatsApp Flow steps and template buttons. Meta keeps it as DRAFT when it finds validation errors (see `validationErrors`).",
      tags,
    })
    .input(publishMiniAppPublicRequest)
    .output(
      z.object({
        status: z.string().describe("Meta Flow status after the call."),
        published: z.boolean(),
        whatsappFlowId: z.string().nullable(),
        validationErrors: z
          .array(z.unknown())
          .describe("Meta's validation errors, if any."),
      }),
    )
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const publication = await publishMiniAppToWhatsapp({
        workspaceId: context.workspace.id,
        miniAppId: input.id,
        integrationWhatsappId: input.integrationWhatsappId,
      })
      return {
        status: publication.status,
        published: publication.status === "PUBLISHED",
        whatsappFlowId: publication.whatsappFlowId,
        validationErrors: publication.validationErrors as unknown[],
      }
    }),

  listSubmissions: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/mini-apps/{id}/submissions",
      summary: "List Mini App answers",
      description:
        "Returns answers submitted through the Mini App's public link, newest first, keyed by input name; uploaded photos/documents come as `{ url, name, mimeType, size }` lists. Answers given inside WhatsApp arrive as Flow responses instead. Returns `{ data, pageCount }`; page with `page`/`perPage`.",
      tags,
    })
    .input(listMiniAppSubmissionsPublicRequest)
    .output(listMiniAppSubmissionsPublicResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      await miniAppService.findOrFail({
        workspaceId: context.workspace.id,
        id: input.id,
      })
      const result = await miniAppSubmissionService.list({
        workspaceId: context.workspace.id,
        miniAppId: input.id,
        page: input.page,
        perPage: input.perPage,
      })
      return {
        data: result.data.map((submission) => ({
          id: submission.id,
          contactId: submission.contactId,
          answers: submission.answers,
          createdAt: submission.createdAt,
        })),
        pageCount: result.pageCount,
      }
    }),
}
