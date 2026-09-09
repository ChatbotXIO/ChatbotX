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
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { publicListRequest, publicListResponse } from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  createFlowSchema,
  publishFlowSchema,
  updateDraftFlowVersionSchema,
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
      description: "Lists active flows in the workspace.",
      tags: ["Flows"],
    })
    .input(
      publicListRequest.extend({
        active: z.boolean().optional().default(true),
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
      description: "Returns a flow with its list of versions.",
      tags: ["Flows"],
    })
    .input(z.object({ id: zodBigintAsString() }))
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
        "Creates a new draft flow seeded with a single default start node.",
      successStatus: 201,
      tags: ["Flows"],
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
    .input(updateFlowSchema.and(z.object({ id: zodBigintAsString() })))
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
      successStatus: 204,
      tags: ["Flows"],
    })
    .input(z.object({ id: zodBigintAsString() }))
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
      description: "Duplicates a flow's draft version into a new flow.",
      successStatus: 201,
      tags: ["Flows"],
    })
    .input(z.object({ id: zodBigintAsString() }))
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
        "Publishes the given nodes/edges as a new immutable version and syncs the draft to match.",
      tags: ["Flows"],
    })
    .input(publishFlowSchema.and(z.object({ id: zodBigintAsString() })))
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, nodes, edges } = input
      await flowVersionService.publish({
        workspaceId: context.workspace.id,
        flowId: id,
        nodes,
        edges,
      })
    }),

  updateDraft: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/flows/{id}/draft",
      summary: "Update a flow's draft version",
      description:
        "Overwrites the draft version's nodes/edges in place, without publishing.",
      tags: ["Flows"],
    })
    .input(
      updateDraftFlowVersionSchema.and(z.object({ id: zodBigintAsString() })),
    )
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, nodes, edges } = input
      await flowVersionService.updateDraftByFlowId({
        workspaceId: context.workspace.id,
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
      tags: ["Flows"],
    })
    .input(z.object({ id: zodBigintAsString() }))
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
        fileId: zodBigintAsString(),
        folderId: zodBigintAsString().nullable(),
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
