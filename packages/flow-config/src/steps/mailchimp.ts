import { createId } from "@paralleldrive/cuid2"
import { z } from "zod"

export const mailchimpSchema = z.object({
  id: z.cuid2(),
  listId: z.string().min(1),
  successNodeId: z.string().nullish(),
  errorNodeId: z.string().nullish(),
})

export const mailchimpDefaultFn = () => ({
  id: createId(),
  listId: "",
})
