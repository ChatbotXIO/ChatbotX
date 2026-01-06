import { z } from "zod"

export const mailchimpSchema = z.object({
  listId: z.string().min(1),
  successNodeId: z.string().nullish(),
  errorNodeId: z.string().nullish(),
})

export const mailchimpDefaultFn = () => ({
  listId: "",
})
