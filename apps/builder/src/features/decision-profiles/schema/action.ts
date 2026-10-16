import { z } from "zod"
import { decisionProfileFormSchema } from "./form"

export const decisionProfileActionSchema = decisionProfileFormSchema

export const decisionProfileToggleSchema = z
  .object({
    enabled: z.boolean(),
    id: z.string().regex(/^\d+$/),
  })
  .strict()
