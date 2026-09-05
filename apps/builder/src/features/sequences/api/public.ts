import z from "zod"
import { basePaginationRequest } from "@/lib/pagination"
import { workspaceTokenAuthAPIForScope } from "@/orpc"

import { getSequence, listSequences } from "../queries"
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
    .input(basePaginationRequest)
    .output(listSequencesResponse)
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
    .handler(
      async ({ context, input }) =>
        await getSequence(context.workspace.id, input.id),
    ),
}
