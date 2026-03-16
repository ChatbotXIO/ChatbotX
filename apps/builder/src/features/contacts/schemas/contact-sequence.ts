import { z } from "zod"

export const addContactSequenceRequest = z.object({
  ids: z.array(z.cuid2()).min(1, "validation.minOneContactRequired"),
  sequences: z.array(z.cuid2()).min(1, "validation.minOneSequenceRequired"),
})

export type AddContactSequenceRequest = z.infer<
  typeof addContactSequenceRequest
>

export const removeContactSequenceRequest = z.object({
  ids: z.array(z.cuid2()).min(1, "validation.minOneContactRequired"),
  sequences: z.array(z.cuid2()).min(1, "validation.minOneSequenceRequired"),
})

export type RemoveContactSequenceRequest = z.infer<
  typeof removeContactSequenceRequest
>
