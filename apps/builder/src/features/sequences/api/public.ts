import { sequenceService } from "@chatbotx.io/business/sequence"
import z from "zod"
import {
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
} from "@/lib/orpc/orpc-error-helper"
import { publicListRequest } from "@/lib/public-api/list"
import { workspaceTokenAuthAPIForScope } from "@/orpc"
import { listSequences } from "../queries"
import { listSequencesResponse } from "../schema/action"
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
        await listSequences({
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
}
