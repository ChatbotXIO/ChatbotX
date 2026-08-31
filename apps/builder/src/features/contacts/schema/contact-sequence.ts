import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

export const addContactSequenceRequest = z.object({
  ids: z.array(zodBigintAsString()).min(1, "validation.minOneContactRequired"),
  sequences: z
    .array(zodBigintAsString())
    .min(1, "validation.minOneSequenceRequired"),
})

export type AddContactSequenceRequest = z.infer<
  typeof addContactSequenceRequest
>

export const removeContactSequenceRequest = z.object({
  ids: z.array(zodBigintAsString()).min(1, "validation.minOneContactRequired"),
  sequences: z
    .array(zodBigintAsString())
    .min(1, "validation.minOneSequenceRequired"),
})

export type RemoveContactSequenceRequest = z.infer<
  typeof removeContactSequenceRequest
>
