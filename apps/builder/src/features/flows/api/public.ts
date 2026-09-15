import {
  flowService,
  flowVersionService,
  importService,
} from "@chatbotx.io/business"
import { validationException } from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { DefaultJobAction, defaultQueue } from "@chatbotx.io/worker-config"
import { z } from "zod"
import { flowVersionResource } from "@/features/flow-versions/schema/resource"
import { mcpSpec } from "@/lib/orpc/mcp-annotations"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { publicListRequest, publicListResponse } from "@/lib/public-api/list"
import { publicIdParam } from "@/lib/public-api/params"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  compileAndValidateSpec,
  compileSpecToGraph,
} from "../lib/compile-spec-to-graph"
import {
  createFlowSchema,
  flowSpecRequest,
  publishFlowRequest,
  publishFlowSchema,
  updateDraftFlowRequest,
  updateFlowSchema,
} from "../schema/action"
import { flowResource, flowWithVersionsResource } from "../schema/resource"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("automation")

export const flowsPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/flows",
      summary: "List flows",
      description:
        "Use this to find flow ids and names before fetching one with `flows.get` or publishing a draft with `flows.publish`. Returns active flows in the workspace.",
      tags: ["Flows"],
      spec: mcpSpec({ visibility: "default" }),
    })
    .input(
      publicListRequest.extend({
        active: z
          .boolean()
          .optional()
          .default(true)
          .describe(
            "Restrict to active flows. Set to false to include inactive ones too.",
          ),
      }),
    )
    .output(publicListResponse(flowResource.pick({ id: true, name: true })))
    .errors(possibleErrorsOnListingResource)
    .handler(async ({ context, input }) => {
      const { data, pageCount } = await flowService.list({
        ...input,
        workspaceId: context.workspace.id,
      })
      return {
        data: data.map((flow) => ({ id: flow.id, name: flow.name })),
        pageCount,
      }
    }),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/flows/{id}",
      summary: "Get a flow by id",
      description:
        "Use this to inspect one flow and its versions after finding its id with `flows.list`. Call `flows.updateDraft` to change the draft or `flows.publish` to create a version.",
      tags: ["Flows"],
      spec: mcpSpec({ visibility: "default" }),
    })
    .input(publicIdParam("flow", "flows.list"))
    .output(flowWithVersionsResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await flowService.findById({
          workspaceId: context.workspace.id,
          id: input.id,
        }),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/flows",
      summary: "Create a flow",
      description:
        "Starts a draft flow with its default start node. Use `flows.list` to inspect existing flows first, then call `flows.updateDraft` or `flows.publish` to complete it.",
      successStatus: 201,
      tags: ["Flows"],
      spec: mcpSpec({ visibility: "default" }),
    })
    .input(createFlowSchema)
    .output(z.object({ id: z.string() }))
    .errors(possibleErrorsOnCreatingResource)
    .handler(
      async ({ context, input }) =>
        await flowService.createDraft({
          workspaceId: context.workspace.id,
          data: input,
        }),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/flows/{id}",
      summary: "Update flow settings",
      description:
        "Partially updates a flow's name, active, or enableInInbox flags.",
      tags: ["Flows"],
    })
    .input(updateFlowSchema.and(publicIdParam("flow", "flows.list")))
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...data } = input
      await flowService.update({ workspaceId: context.workspace.id, id }, data)
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/flows/{id}",
      summary: "Delete a flow",
      description:
        "Permanently deletes a flow and its draft/published versions. Use `flows.get` to confirm it first.",
      successStatus: 204,
      tags: ["Flows"],
    })
    .input(publicIdParam("flow", "flows.list"))
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await flowService.deleteMany({
        workspaceId: context.workspace.id,
        ids: [input.id],
      })
    }),

  duplicate: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/flows/{id}/duplicate",
      summary: "Duplicate a flow",
      description:
        "Copies a flow's draft into a new flow. Use `flows.get` to inspect the source first, then call `flows.updateDraft` or `flows.publish` on the returned flow.",
      successStatus: 201,
      tags: ["Flows"],
    })
    .input(publicIdParam("flow", "flows.list"))
    .output(z.object({ id: z.string() }))
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const id = await flowService.duplicate({
        workspaceId: context.workspace.id,
        id: input.id,
      })
      return { id }
    }),

  publish: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/flows/{id}/publish",
      summary: "Publish a flow",
      description:
        "Creates an immutable version from a draft and synchronizes the draft to match. Call `flows.validate` before this when supplying a spec, or use `flows.updateDraft` to save changes without publishing.",
      tags: ["Flows"],
      spec: mcpSpec({ visibility: "default" }),
    })
    .input(publishFlowRequest.and(publicIdParam("flow", "flows.list")))
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id } = input
      const workspaceId = context.workspace.id
      const { nodes, edges } =
        "spec" in input
          ? await compileAndValidateSpec(input.spec, workspaceId)
          : input
      await flowVersionService.publish({
        workspaceId,
        flowId: id,
        nodes,
        edges,
      })
    }),

  validate: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/flows/validate",
      summary: "Compile and validate a flow spec without publishing it",
      description:
        "Compiles a flow-spec DSL object (see `GET /v1/schemas/flow-spec`) and validates the result exactly like `flows.publish` would, without persisting anything. On success, returns the compiled node/edge graph. On failure, returns a 422 with structured errors (`path`/`code`/`message`/`hint`/`candidates`) — fix and retry before calling `flows.publish`.",
      tags: ["Flows"],
      spec: mcpSpec({ visibility: "default" }),
    })
    .input(flowSpecRequest)
    .output(publishFlowSchema)
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) =>
      compileAndValidateSpec(input.spec, context.workspace.id),
    ),

  updateDraft: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/flows/{id}/draft",
      summary: "Update a flow's draft version",
      description:
        "Overwrites the draft version's nodes/edges in place, without publishing. Accepts either the raw `{ nodes, edges }` graph the builder UI sends, or `{ spec }` compiled server-side into that same graph — draft nodes are not otherwise validated (see `flows.validate` to check a spec before writing it).",
      tags: ["Flows"],
      spec: mcpSpec({ visibility: "default" }),
    })
    .input(updateDraftFlowRequest.and(publicIdParam("flow", "flows.list")))
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id } = input
      const workspaceId = context.workspace.id
      const { nodes, edges } =
        "spec" in input
          ? await compileSpecToGraph(input.spec, workspaceId)
          : input
      await flowVersionService.updateDraftByFlowId({
        workspaceId,
        flowId: id,
        nodes,
        edges,
      })
    }),

  versions: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/flows/{id}/versions",
      summary: "List a flow's published versions",
      description:
        "Returns every immutable version created by `flows.publish` for this flow, most recent first.",
      tags: ["Flows"],
    })
    .input(publicIdParam("flow", "flows.list"))
    .output(z.object({ data: z.array(flowVersionResource) }))
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const data = await flowVersionService.list({
        flowId: input.id,
        workspaceId: context.workspace.id,
      })
      return { data }
    }),

  import: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/flows/import",
      summary: "Import a flow from a previously uploaded file",
      description:
        "Queues an async import job for a flow export file uploaded via the Files API. Returns the import id; poll or watch for completion out of band.",
      successStatus: 202,
      tags: ["Flows"],
    })
    .input(
      z.object({
        fileId: zodBigintAsString().describe(
          "Id (numeric string) of a previously uploaded flow-export file.",
        ),
        folderId: zodBigintAsString()
          .nullable()
          .describe(
            "Folder id (numeric string) to import the flow into, or null for no folder.",
          ),
      }),
    )
    .output(z.object({ importId: z.string() }))
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) => {
      const result = await importService.startFlowImport({
        workspaceId: context.workspace.id,
        userId: null,
        fileId: input.fileId,
        folderId: input.folderId,
      })
      if (!result.ok) {
        throw validationException(
          "fileId",
          result.reason === "fileNotFound"
            ? "File not found"
            : "File is not a flow import",
        )
      }

      await defaultQueue.add(DefaultJobAction.runImport, {
        type: DefaultJobAction.runImport,
        data: { importId: result.importId },
      })

      return { importId: result.importId }
    }),
}
