import { z } from "zod"

export const connectMailchimpSchema = z.object({
  apiKey: z.string().trim().min(1),
})
