import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const listContactSequencesPublicResponse = z.object({
  data: z.array(
    z.object({
      sequenceId: z.string(),
      sequenceName: z.string(),
    }),
  ),
})

export const contactSequenceIdsPublicRequest = z.object({
  sequenceIds: z
    .array(zodBigintAsString())
    .min(1, "At least one sequence id is required")
    .max(100),
})
export type ContactSequenceIdsPublicRequest = z.infer<
  typeof contactSequenceIdsPublicRequest
>

export const setContactSequencesPublicRequest = z.object({
  sequenceIds: z.array(zodBigintAsString()).max(100),
})
export type SetContactSequencesPublicRequest = z.infer<
  typeof setContactSequencesPublicRequest
>
