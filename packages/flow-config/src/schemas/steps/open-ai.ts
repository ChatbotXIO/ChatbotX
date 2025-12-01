import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"

export const openAISchema = z.object({
  id: z.cuid2(),
  model: z.string().trim().min(1),
})

export const openAIDefaultFn = () => ({
  id: createId(),
  model: "gpt-4o-mini",
})
