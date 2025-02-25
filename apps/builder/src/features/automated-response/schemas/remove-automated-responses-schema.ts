import { z } from "zod"

export const removeAutomatedResponseSchema = z.object({})

export type RemoveAutomatedResponseSchema = z.infer<
  typeof removeAutomatedResponseSchema
>

export const removeAutomatedResponseBindSchema: [id: z.ZodString] = [
  z.string().cuid2(),
]
export type RemoveAutomatedResponseBindSchema = [id: string]
