import { z } from "zod"

export const connectDripSchema = z.object({
  apiToken: z.string().trim().min(1),
})
