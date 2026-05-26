import z from "zod"
import { basePaginationRequest } from "@/lib/pagination"
import { workspaceTokenAuthAPI } from "@/orpc"
import { getSequence, listSequences } from "../queries"
import { listSequencesResponse } from "../schema/action"
import { sequenceResource } from "../schema/resource"

export const sequencesWorkspaceTokenAPIs = {
  listSequencesWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/sequences",
      summary: "Listar sequências",
      tags: ["Sequências"],
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

  getSequenceWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/sequences/{id}",
      summary: "Obter detalhes da sequência",
      tags: ["Sequências"],
    })
    .input(z.object({ id: z.string() }))
    .output(sequenceResource)
    .handler(
      async ({ context, input }) =>
        await getSequence(context.workspace.id, input.id),
    ),
}
