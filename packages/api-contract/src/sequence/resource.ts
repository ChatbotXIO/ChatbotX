import { createSelectSchema, sequenceModel } from "@chatbotx.io/database/schema"
import { z } from "zod"
import { basePaginationInput } from "../shared/pagination"

export const publicSequenceResource = createSelectSchema(sequenceModel, {
  id: z.string(),
  workspaceId: z.string(),
  folderId: z.string().nullable(),
})
export type PublicSequenceResource = z.infer<typeof publicSequenceResource>

export const listSequencesInput = basePaginationInput
export type ListSequencesInput = z.infer<typeof listSequencesInput>

export const publicListSequencesResponse = z.object({
  data: z.array(
    publicSequenceResource.and(
      z.object({
        stepsCount: z.number(),
        subscribersCount: z.number(),
      }),
    ),
  ),
  pageCount: z.number(),
})
export type PublicListSequencesResponse = z.infer<
  typeof publicListSequencesResponse
>
