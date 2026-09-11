import { sequenceService } from "@chatbotx.io/business/sequence"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnMutatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { publicListRequest } from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import {
  createSequenceRequest,
  listSequencesResponse,
  publicUpsertSequenceStepRequest,
  updateSequenceSchema,
} from "../schema/action"
import { sequenceResource } from "../schema/resource"

const workspaceTokenAuthAPI = workspaceTokenAuthAPIForScope("broadcasts")

export const sequencesPublicRouter = {
  list: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/sequences",
      summary: "List sequences",
      tags: ["Sequences"],
    })
    .input(publicListRequest)
    .output(listSequencesResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await sequenceService.list({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  get: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/sequences/{id}",
      summary: "Get sequence details",
      tags: ["Sequences"],
    })
    .input(z.object({ id: z.string() }))
    .output(sequenceResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await sequenceService.findWithSteps({
          workspaceId: context.workspace.id,
          id: input.id,
        }),
    ),

  create: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/sequences",
      summary: "Create a sequence",
      successStatus: 201,
      tags: ["Sequences"],
    })
    .input(createSequenceRequest)
    .output(z.object({ sequenceId: z.string() }))
    .errors(possibleErrorsOnCreatingResource)
    .handler(
      async ({ context, input }) =>
        await sequenceService.create({
          ...input,
          workspaceId: context.workspace.id,
        }),
    ),

  update: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/sequences/{id}",
      summary: "Update a sequence's name or active state",
      tags: ["Sequences"],
    })
    .input(updateSequenceSchema.and(z.object({ id: zodBigintAsString() })))
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...data } = input
      await sequenceService.update(
        { workspaceId: context.workspace.id, id },
        data,
      )
    }),

  delete: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/sequences/{id}",
      summary: "Delete a sequence",
      successStatus: 204,
      tags: ["Sequences"],
    })
    .input(z.object({ id: zodBigintAsString() }))
    .errors(possibleErrorsOnDeletingResource)
    .handler(
      async ({ context, input }) =>
        await sequenceService.delete({
          workspaceId: context.workspace.id,
          id: input.id,
        }),
    ),

  upsertStep: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/sequences/{id}/steps",
      summary: "Create or update a sequence step",
      description:
        "Pass stepId to update an existing step; omit it to create a new one.",
      tags: ["Sequences"],
    })
    .input(
      publicUpsertSequenceStepRequest.and(
        z.object({ id: zodBigintAsString() }),
      ),
    )
    .output(z.object({ stepId: z.string() }))
    .errors(possibleErrorsOnMutatingResource)
    .handler(async ({ context, input }) => {
      // The `{id}` path segment is the sole source of truth for which
      // sequence is being scoped/owned — the body has no `sequenceId` field
      // to reconcile against it (see `publicUpsertSequenceStepRequest`).
      const { id, stepId, ...data } = input
      await sequenceService.assertOwned({
        workspaceId: context.workspace.id,
        sequenceId: id,
      })
      return await sequenceService.upsertStep({
        workspaceId: context.workspace.id,
        sequenceId: id,
        stepId,
        data,
      })
    }),

  deleteStep: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/sequences/{id}/steps/{stepId}",
      summary: "Delete a sequence step",
      successStatus: 204,
      tags: ["Sequences"],
    })
    .input(z.object({ id: zodBigintAsString(), stepId: zodBigintAsString() }))
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      await sequenceService.assertOwned({
        workspaceId: context.workspace.id,
        sequenceId: input.id,
      })
      // `{id}` is not decorative: without it the step resolves by `stepId`
      // alone and a step of another sequence in the same workspace would be
      // deleted through this sequence's URL.
      await sequenceService.deleteStep({
        workspaceId: context.workspace.id,
        sequenceId: input.id,
        stepId: input.stepId,
      })
    }),
}
